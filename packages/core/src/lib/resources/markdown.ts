import { glob } from "globlin";
import matter from "gray-matter";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export async function list<T>(
  path: string,
  mapper: (data: ReturnType<typeof matter>["data"], content: string) => T,
): Promise<Record<string, T>> {
  const files = await glob("*.md", { cwd: path, absolute: true });
  const output: Record<string, T> = {};

  await Promise.all(
    files.map(async (file) => {
      try {
        const name = basename(file, ".md");
        const contents = await readFile(file, "utf-8");
        const { data, content } = matter(contents);

        output[name] = mapper(data, content);
      } catch {
        // Do not block if a file is malformed
      }
    }),
  );

  return output;
}
