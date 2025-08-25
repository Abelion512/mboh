import fs from 'fs';
import crypto from 'crypto';
import { globby } from 'globby';

// Ambil catatan rilis dari CHANGELOG (baris teratas)
function readTopChangelog() {
  if (!fs.existsSync('CHANGELOG.md')) return { version: null, notes: "" };
    const text = fs.readFileSync('CHANGELOG.md', 'utf8');
      // Format default semantic-release: "## <version> (<date>)"
        const m = text.match(/^##\s+([\d.]+)\s+\(([^)]+)\)[\s\S]*?\n\n([\s\S]*?)(?:\n##\s+|\n$)/m);
          if (!m) return { version: null, notes: "" };
            return { version: m[1], notes: m[3].trim() };
            }

            function sha256(buf) {
              return crypto.createHash('sha256').update(buf).digest('hex');
              }

              const files = await globby([
                'index.html',
                  'styles.css',
                    'app.js',
                      'sw.js',
                        'manifest.webmanifest',
                          'assets/**/*.*'
                          ], { dot: false, onlyFiles: true, gitignore: true });

                          const assets = files.map(p => {
                            const buf = fs.readFileSync(p);
                              return {
                                  path: `/${p}`,
                                      bytes: buf.length,
                                          sha256: sha256(buf)
                                            };
                                            });

                                            const totalBytes = assets.reduce((a, b) => a + b.bytes, 0);
                                            const { version, notes } = readTopChangelog();

                                            const manifest = {
                                              app: "Abelion AI",
                                                version: version || "0.0.0",
                                                  released_at: new Date().toISOString(),
                                                    changelog_markdown: notes || "Perbaikan & peningkatan.",
                                                      assets,
                                                        total_bytes: totalBytes
                                                        };

                                                        fs.writeFileSync('update-manifest.json', JSON.stringify(manifest, null, 2));
                                                        console.log('✔ update-manifest.json dibuat:', manifest.version, totalBytes, 'bytes');