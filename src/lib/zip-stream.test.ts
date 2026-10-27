import { describe, it, expect, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';

vi.mock('server-only', () => ({}));

const { ZipStream } = await import('./zip-stream');

/** Relit un ZIP par son répertoire central (comme le font Windows et 7-Zip). */
function readZip(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const localNameLen = buf.readUInt16LE(offset + 26);
    const data = buf.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + compressed);
    out[name] = inflateRawSync(data).toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

describe('ZIP au fil de l’eau', () => {
  it('produit un ZIP lisible, accents et gros fichiers compris', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new ZipStream((c) => chunks.push(c));
    await zip.addFile('élèves.csv', async (put) => {
      await put('Matricule;Nom\n');
      await put('ELV-1;KOUAMÉ Aya\n');
    });
    const big = 'x;'.repeat(200_000);
    await zip.addFile('notes.csv', async (put) => {
      for (let i = 0; i < 5; i++) await put(big);
    });
    zip.finish();
    const files = readZip(Buffer.concat(chunks));
    expect(Object.keys(files)).toEqual(['élèves.csv', 'notes.csv']);
    expect(files['élèves.csv']).toBe('Matricule;Nom\nELV-1;KOUAMÉ Aya\n');
    expect(files['notes.csv']!.length).toBe(big.length * 5);
  });
});
