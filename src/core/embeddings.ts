import type { Config } from "./config.js";

export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
}

/**
 * Zero-config local embedder. Hashes tokens into a fixed-size vector
 * (a normalized hashed bag-of-words). It is NOT as good as a real model,
 * but it makes semantic-ish search work with no API key and no native deps,
 * so the tool is useful the moment it is installed. Upgrade to "openai" for quality.
 */
export class LocalEmbedder implements Embedder {
  readonly name = "local-hash-256";
  readonly dim = 256;

  async embed(text: string): Promise<Float32Array> {
    const vec = new Float32Array(this.dim);
    const tokens = tokenize(text);
    for (const tok of tokens) {
      // Two hashes reduce collisions a little (bloom-ish).
      const h1 = hash(tok) % this.dim;
      const h2 = hash("§" + tok) % this.dim;
      vec[h1] += 1;
      vec[h2] += 1;
    }
    normalize(vec);
    return vec;
  }
}

/** Higher-quality embeddings via the OpenAI embeddings API. */
export class OpenAIEmbedder implements Embedder {
  readonly name: string;
  readonly dim = 1536; // text-embedding-3-small
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.name = `openai:${model}`;
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: text, model: this.model }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embeddings failed (${res.status}): ${body}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return Float32Array.from(json.data[0].embedding);
  }
}

export function makeEmbedder(config: Config): Embedder {
  if (config.embedder === "openai") {
    if (!config.openaiApiKey) {
      throw new Error(
        "CTXBRIDGE_EMBEDDER=openai but OPENAI_API_KEY is not set. Set the key or use the local embedder.",
      );
    }
    return new OpenAIEmbedder(config.openaiApiKey, config.openaiEmbedModel);
  }
  return new LocalEmbedder();
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  // Vectors are stored pre-normalized, so dot product == cosine similarity.
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function normalize(vec: Float32Array): void {
  let mag = 0;
  for (let i = 0; i < vec.length; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag === 0) return;
  for (let i = 0; i < vec.length; i++) vec[i] /= mag;
}

/** Deterministic 32-bit FNV-1a hash. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
