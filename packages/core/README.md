# @fabianmossberg/fabpix-core

The provider, settings and manifest layer behind the [fabpix](https://github.com/fabianmossberg/fabpix) CLI,
published so build-time tooling (Vite / Svelte plugins) can share it.

```ts
import { getProvider, loadSettings, readManifest } from "@fabianmossberg/fabpix-core";
```
