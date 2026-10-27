import 'server-only';

import { createDeflateRaw } from 'node:zlib';

/**
 * Un fichier ZIP fabriqué AU FIL DE L'EAU : chaque fichier est compressé et
 * envoyé pendant qu'il est produit, sans tout garder en mémoire, et la réponse
 * HTTP avance en continu (un export de 2 minutes n'est pas coupé par un
 * proxy qui attend une réponse). Format ZIP classique, compression « deflate »,
 * tailles en fin de fichier (bit 3) : lisible par Windows, Excel, 7-Zip.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(crc: number, buf: Uint8Array): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type Entry = { name: Buffer; crc: number; compressed: number; size: number; offset: number; time: number; date: number };

export class ZipStream {
  private offset = 0;
  private entries: Entry[] = [];
  constructor(private readonly write: (chunk: Uint8Array) => void) {}

  private push(buf: Buffer) {
    this.write(buf);
    this.offset += buf.length;
  }

  /** Ajoute un fichier : `produce` écrit son contenu morceau par morceau (texte UTF-8). */
  async addFile(name: string, produce: (put: (text: string) => Promise<void>) => Promise<void>): Promise<void> {
    const nameBuf = Buffer.from(name, 'utf8');
    const { time, date } = dosTime(new Date());
    const offset = this.offset;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version
    head.writeUInt16LE(0x0808, 6); // bit 3 : tailles en fin ; bit 11 : nom en UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt16LE(nameBuf.length, 26);
    this.push(Buffer.concat([head, nameBuf]));

    let crc = 0;
    let size = 0;
    let compressed = 0;
    const deflate = createDeflateRaw({ level: 6 });
    const done = new Promise<void>((resolve, reject) => {
      deflate.on('data', (chunk: Buffer) => {
        compressed += chunk.length;
        this.push(chunk);
      });
      deflate.on('end', resolve);
      deflate.on('error', reject);
    });
    const put = async (text: string) => {
      const buf = Buffer.from(text, 'utf8');
      crc = crc32(crc, buf);
      size += buf.length;
      if (!deflate.write(buf)) await new Promise<void>((r) => deflate.once('drain', () => r()));
    };
    await produce(put);
    deflate.end();
    await done;

    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    desc.writeUInt32LE(compressed, 8);
    desc.writeUInt32LE(size, 12);
    this.push(desc);
    this.entries.push({ name: nameBuf, crc, compressed, size, offset, time, date });
  }

  /** Écrit le répertoire central : à appeler une fois, après le dernier fichier. */
  finish(): void {
    const start = this.offset;
    for (const e of this.entries) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0808, 8);
      h.writeUInt16LE(8, 10);
      h.writeUInt16LE(e.time, 12);
      h.writeUInt16LE(e.date, 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(e.compressed, 20);
      h.writeUInt32LE(e.size, 24);
      h.writeUInt16LE(e.name.length, 28);
      h.writeUInt32LE(e.offset, 42);
      this.push(Buffer.concat([h, e.name]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12);
    end.writeUInt32LE(start, 16);
    this.push(end);
  }
}
