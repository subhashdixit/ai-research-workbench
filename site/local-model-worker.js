/** Keyless open-model inference. User content stays inside this browser worker. */
import {
  env,
  AutoTokenizer,
  AutoModelForCausalLM,
  AutoProcessor,
  AutoModelForImageTextToText,
  RawImage,
  TextStreamer,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js";
import { MODEL_CATALOG, prepareGeneration } from "./model-policy.js";
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = new URL(
  "./vendor/ai/",
  import.meta.url,
).href;
self.onmessage = async (event) => {
  let model;
  try {
    const request = prepareGeneration(event.data);
    const spec = MODEL_CATALOG[request.model];
    const progress_callback = (progress) =>
      self.postMessage({
        type: "progress",
        text: `Model ${progress.status || "loading"} · ${progress.file || ""} ${progress.progress ? Math.round(progress.progress) + "%" : ""}`,
      });
    const options = {
      revision: spec.revision,
      dtype: "q8",
      device: "wasm",
      progress_callback,
    };
    let inputs, tokenizer;
    if (request.model === "vision") {
      const processor = await AutoProcessor.from_pretrained(spec.id, {
        revision: spec.revision,
        progress_callback,
      });
      model = await AutoModelForImageTextToText.from_pretrained(
        spec.id,
        options,
      );
      const raw = await RawImage.read(request.image);
      const scale = Math.min(1, 512 / Math.max(raw.width, raw.height));
      const image = await raw.resize(
        Math.max(1, Math.round(raw.width * scale)),
        Math.max(1, Math.round(raw.height * scale)),
      );
      const prompt = processor.apply_chat_template(
        [
          {
            role: "user",
            content: [
              { type: "image" },
              { type: "text", text: request.question + "\n" + request.context },
            ],
          },
        ],
        { add_generation_prompt: true },
      );
      inputs = await processor(prompt, image, { do_image_splitting: false });
      tokenizer = processor.tokenizer;
    } else {
      tokenizer = await AutoTokenizer.from_pretrained(spec.id, {
        revision: spec.revision,
        progress_callback,
      });
      model = await AutoModelForCausalLM.from_pretrained(spec.id, options);
      const prompt = tokenizer.apply_chat_template(
        [
          { role: "system", content: request.instruction },
          {
            role: "user",
            content: `Question: ${request.question}\nSupplied evidence:\n${request.context}`,
          },
        ],
        { tokenize: false, add_generation_prompt: true },
      );
      inputs = tokenizer(prompt, { add_special_tokens: false });
    }
    const inputTokens = inputs.input_ids.dims.at(-1);
    if (inputTokens > 1800)
      throw Error(
        "Evidence exceeds the 1,800-token local-model input limit. Shorten the document or select fewer excerpts.",
      );
    self.postMessage({
      type: "progress",
      text: `Generating locally with ${spec.id}; ${inputTokens} input tokens. No prompt upload.`,
    });
    let stream = "";
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (part) => {
        stream += part;
        self.postMessage({ type: "token", text: stream });
      },
    });
    const output = await model.generate({
      ...inputs,
      max_new_tokens: 160,
      do_sample: false,
      repetition_penalty: 1.1,
      streamer,
    });
    const answer = tokenizer
      .decode(output.tolist()[0].slice(inputTokens), {
        skip_special_tokens: true,
      })
      .trim();
    if (!answer)
      throw Error(
        "The local model returned no text. Try a shorter, clearer request.",
      );
    self.postMessage({
      type: "result",
      answer,
      model: spec.id,
      inputTokens,
      maxNewTokens: 160,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      text: error.message || "The local model could not run on this device.",
    });
  } finally {
    if (model) await model.dispose();
  }
};
