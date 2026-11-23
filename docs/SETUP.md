# Development setup

## Requirements

- **Node.js 26 LTS** (see `.node-version`).
- **Corepack**, which manages the pnpm version pinned in `package.json`. It is no longer bundled with Node.js
  since v25, so it must be installed once.
- Git.

## 1. Install Node.js 26

Any method works: your distribution's package, a version manager (fnm, mise, nvm) or the official binaries.
With the official binaries on Linux x64, verifying the checksum:

```sh
V=v26.13.1
cd "$(mktemp -d)"
curl -fsSLO "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/$V/SHASUMS256.txt"
grep " node-$V-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
mkdir -p ~/.local/lib/node
tar -xJf "node-$V-linux-x64.tar.xz" -C ~/.local/lib/node --strip-components=1
echo 'export PATH="$HOME/.local/lib/node/bin:$PATH"' >> ~/.profile
```

Open a new terminal and check `node --version`.

### Optional: verify the signature

The checksum proves **integrity** (the archive matches `SHASUMS256.txt`), not **authenticity**: both files come
from the same server, so whoever could replace one could replace the other. The Node.js releasers sign
`SHASUMS256.txt` with GPG; their public keys are published in a separate repository,
[nodejs/release-keys](https://github.com/nodejs/release-keys). Checking the signature against those keys moves
the trust to a second, independent channel (GitHub). Run this in the same directory, **before** extracting:

```sh
git clone --depth 1 https://github.com/nodejs/release-keys
curl -fsSLO "https://nodejs.org/dist/$V/SHASUMS256.txt.sig"
gpgv --keyring ./release-keys/gpg-only-active-keys/pubring.kbx SHASUMS256.txt.sig SHASUMS256.txt
```

Expect `Good signature from "<name of a Node.js releaser>"`. A modified file gives `BAD signature` and a non-zero
exit code. We use the **detached** signature `SHASUMS256.txt.sig`: with the clear-signed `SHASUMS256.txt.asc`,
`gpg --verify` checks the text embedded in the `.asc`, not the separate `SHASUMS256.txt` that `sha256sum` reads.
Use `gpg-only-active-keys` for current releases, or the `gpg` keyring for old releases signed by retired keys.

> **VSCodium or VS Code installed as a Flatpak**: the integrated terminal runs inside the sandbox. The sandbox
> sees your home directory, and the `PATH` already includes
> `~/.var/app/com.vscodium.codium/data/node/bin`. Linking Node there makes it available in the editor's terminal
> too:
>
> ```sh
> ln -s ~/.local/lib/node ~/.var/app/com.vscodium.codium/data/node
> ```

## 2. Install Corepack and enable pnpm

```sh
npm install --global corepack@0.36.0
corepack enable
pnpm --version   # prints the version pinned in package.json
```

## 3. Install and check

```sh
pnpm install
pnpm check       # format check, lint, typecheck, tests with coverage
```

| Command           | What it does                     |
| ----------------- | -------------------------------- |
| `pnpm test`       | Run the tests once               |
| `pnpm test:watch` | Re-run the tests on every change |
| `pnpm lint`       | ESLint with type-aware rules     |
| `pnpm typecheck`  | `tsc` on every package           |
| `pnpm format`     | Format all files with Prettier   |
| `pnpm check`      | Everything CI runs               |

## Dependency policy

`pnpm-workspace.yaml` sets `minimumReleaseAge: 20160`: pnpm refuses package versions published less than
14 days ago, so a compromised release has time to be caught before it reaches us. Our own `@citestar/*`
packages are exempt. When adding a dependency, pin an exact version that is at least 14 days old.
