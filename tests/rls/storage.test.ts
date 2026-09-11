import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  connect, seedFixture, cleanupFixture, countAs, tryWriteAs,
  type Db, type Fixture,
} from './helpers';

/**
 * Isolation du stockage de fichiers (migration 0030).
 *
 * Le stockage ne doit pas etre une porte laterale : un fichier se lit si et
 * seulement si la ligne `documents` qui le decrit est lisible, et s'ecrit
 * uniquement sous le prefixe `schools/{school_id}/` d'un etablissement ou
 * l'on detient la permission.
 *
 * Les objets sont inseres directement dans storage.objects, sans contenu :
 * c'est la ligne qui porte le controle d'acces, pas le fichier.
 */

let db: Db;
let f: Fixture;
const created: string[] = [];

let docChild: string;
let docOther: string;
let avatarA: string;

async function putObject(bucket: string, name: string): Promise<void> {
  await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);
  created.push(name);
}

/**
 * Supabase interdit par trigger la suppression directe dans storage.objects
 * (« utiliser l'API Storage »). La levee se fait explicitement, pour la seule
 * transaction de nettoyage.
 */
async function purgeObjects(names: string[]): Promise<void> {
  if (names.length === 0) return;
  await db.query('begin');
  try {
    await db.query(`set local storage.allow_delete_query = 'true'`);
    await db.query('delete from storage.objects where name = any($1::text[])', [names]);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

beforeAll(async () => {
  db = await connect();
  f = await seedFixture(db);

  docChild = `schools/${f.a.schoolId}/documents/${f.a.childStudentId}/certificat.pdf`;
  docOther = `schools/${f.a.schoolId}/documents/${f.a.otherStudentId}/certificat.pdf`;
  avatarA = `schools/${f.a.schoolId}/students/${f.a.childStudentId}/photo.jpg`;

  // Les lignes documents qui decrivent les fichiers : c'est leur visibilite
  // que le stockage herite.
  for (const [studentId, path] of [
    [f.a.childStudentId, docChild],
    [f.a.otherStudentId, docOther],
  ] as const) {
    await db.query(
      `insert into documents (school_id, owner_type, owner_id, name, storage_path, mime_type, visibility)
       values ($1, 'STUDENT', $2, 'Certificat de scolarite', $3, 'application/pdf', 'GUARDIANS')`,
      [f.a.schoolId, studentId, path],
    );
  }

  await putObject('documents', docChild);
  await putObject('documents', docOther);
  await putObject('avatars', avatarA);
}, 120_000);

afterAll(async () => {
  if (db) {
    await purgeObjects(created);
    await cleanupFixture(db);
    await db.end();
  }
});

const selectByName = 'select id from storage.objects where name = $1';

// ---------------------------------------------------------------------------

describe('Stockage — lecture', () => {
  it('un membre voit une photo de son etablissement', async () => {
    expect(await countAs(db, f.a.teacherUserId, selectByName, [avatarA])).toBe(1);
  });

  it("un membre de B ne voit pas une photo de A", async () => {
    expect(await countAs(db, f.b.adminUserId, selectByName, [avatarA])).toBe(0);
  });

  it('un parent lit le document de son enfant', async () => {
    expect(await countAs(db, f.a.parentUserId, selectByName, [docChild])).toBe(1);
  });

  it("un parent ne lit pas le document d'un autre eleve de la meme classe", async () => {
    expect(await countAs(db, f.a.parentUserId, selectByName, [docOther])).toBe(0);
  });

  it("un admin de B ne lit aucun document de A", async () => {
    expect(await countAs(db, f.b.adminUserId, selectByName, [docChild])).toBe(0);
  });

  it('le Super Admin lit les fichiers de tous les etablissements', async () => {
    const n = await countAs(db, f.platformAdminUserId,
      'select id from storage.objects where name = any($1::text[])',
      [[docChild, docOther, avatarA]]);
    expect(n).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe('Stockage — ecriture', () => {
  const insert = 'insert into storage.objects (bucket_id, name) values ($1, $2)';

  it('un admin depose un document dans son etablissement', async () => {
    const r = await tryWriteAs(db, f.a.adminUserId, insert,
      ['documents', `schools/${f.a.schoolId}/documents/nouveau/fichier.pdf`]);
    expect(r.allowed).toBe(true);
  });

  it("un admin ne depose rien sous le prefixe d'un autre etablissement", async () => {
    const r = await tryWriteAs(db, f.a.adminUserId, insert,
      ['documents', `schools/${f.b.schoolId}/documents/intrus/fichier.pdf`]);
    expect(r.allowed).toBe(false);
  });

  it("un chemin hors de l'arborescence schools/{id}/ est refuse", async () => {
    const r = await tryWriteAs(db, f.a.adminUserId, insert,
      ['documents', 'autre/chemin/fichier.pdf']);
    expect(r.allowed).toBe(false);
  });

  it('un chemin dont le school_id est mal forme est refuse sans erreur', async () => {
    // Le cast direct en uuid ferait echouer la requete ; app.storage_school_id
    // renvoie NULL, et NULL ferme simplement l'acces.
    const r = await tryWriteAs(db, f.a.adminUserId, insert,
      ['documents', 'schools/pas-un-uuid/fichier.pdf']);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('42501');
  });

  it('un parent ne depose pas de document', async () => {
    const r = await tryWriteAs(db, f.a.parentUserId, insert,
      ['documents', `schools/${f.a.schoolId}/documents/parent/fichier.pdf`]);
    expect(r.allowed).toBe(false);
  });

  it("les buckets d'autres applications ne sont pas couverts par ces policies", async () => {
    const r = await tryWriteAs(db, f.a.adminUserId, insert,
      ['inconnu', `schools/${f.a.schoolId}/x.pdf`]);
    expect(r.allowed).toBe(false);
  });
});
