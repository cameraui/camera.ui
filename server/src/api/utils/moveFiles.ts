import { move } from 'fs-extra/esm';
import { lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface MoveOptions {
  overwrite?: boolean;
}

export async function moveFiles(source: string, destination: string, options: MoveOptions = { overwrite: true }): Promise<void> {
  try {
    const sourceStat = await lstat(source);

    await mkdir(dirname(destination), { recursive: true });

    if (sourceStat.isFile()) {
      await move(source, destination, {
        overwrite: options.overwrite,
      });
    } else if (sourceStat.isDirectory()) {
      const files = await readdir(source);

      await Promise.all(
        files.map(async (file) => {
          const sourcePath = join(source, file);
          const targetPath = join(destination, file);

          try {
            const stat = await lstat(sourcePath);

            if (stat.isDirectory() || stat.isFile()) {
              await mkdir(dirname(targetPath), { recursive: true });
              await move(sourcePath, targetPath, {
                overwrite: options.overwrite,
              });
            }
          } catch (error) {
            throw new Error(`Failed to move ${file}: ${error.message}`);
          }
        }),
      );
    }
  } catch (error) {
    throw new Error(`File operation failed: ${error.message}`);
  }
}
