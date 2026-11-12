import fs from 'node:fs/promises';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.({ target: this });
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.({ target: this });
    });
  }
}

if (typeof globalThis.FileReader === 'undefined') globalThis.FileReader = NodeFileReader;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;

export async function exportGLB(root, outPath) {
  const exporter = new GLTFExporter();
  const binary = await exporter.parseAsync(root, { binary: true, onlyVisible: false });
  await fs.writeFile(outPath, Buffer.from(binary));
  return binary.byteLength;
}
