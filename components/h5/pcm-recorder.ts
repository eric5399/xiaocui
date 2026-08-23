"use client";

/** Captures mono 16 kHz signed PCM. This is the documented input for the
 * iFlytek realtime model and avoids sending browser-specific WebM containers. */
export class PcmRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.context = new AudioContext(); await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    this.source.connect(this.processor); this.processor.connect(this.context.destination);
  }
  async stop() {
    const sourceRate = this.context?.sampleRate ?? 16000; const input = this.merge();
    this.processor?.disconnect(); this.source?.disconnect(); this.stream?.getTracks().forEach((track) => track.stop()); await this.context?.close();
    this.processor = null; this.source = null; this.stream = null; this.context = null;
    const sampled = this.resample(input, sourceRate, 16000); const pcm = new Int16Array(sampled.length);
    for (let index = 0; index < sampled.length; index += 1) pcm[index] = Math.max(-1, Math.min(1, sampled[index])) * 0x7fff;
    this.chunks = [];
    return { audio: pcm.buffer, durationMs: Math.round((pcm.length / 16000) * 1000) };
  }
  async cancel() { this.processor?.disconnect(); this.source?.disconnect(); this.stream?.getTracks().forEach((track) => track.stop()); await this.context?.close(); this.chunks = []; }
  private merge() { const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0); const all = new Float32Array(length); let offset = 0; for (const chunk of this.chunks) { all.set(chunk, offset); offset += chunk.length; } return all; }
  private resample(input: Float32Array, sourceRate: number, targetRate: number) { if (sourceRate === targetRate) return input; const ratio = sourceRate / targetRate; const length = Math.round(input.length / ratio); const output = new Float32Array(length); for (let index = 0; index < length; index += 1) { const position = index * ratio; const before = Math.floor(position); const after = Math.min(before + 1, input.length - 1); output[index] = input[before] + (input[after] - input[before]) * (position - before); } return output; }
}
