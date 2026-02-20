⚠️ **WARNING:** This repository may get squashed and force-pushed if the [GordianOpenIntegrity](https://github.com/Stream44/t44-docker.com) implementation must change in incompatible ways. Keep your diffs until the **GordianOpenIntegrity** system is stable.

🔷 **Open Development Project:** The implementation is a preview release for community feedback.

⚠️ **Disclaimer:** Under active development. Code has not been audited, APIs and interfaces are subject to change.

`t44` Capsules for Docker [![Tests](https://github.com/Stream44/t44-docker.com/actions/workflows/test.yaml/badge.svg)](https://github.com/Stream44/t44-docker.com/actions/workflows/test.yaml?query=branch%3Amain)
===

This project [encapsulates](https://github.com/Stream44/encapsulate) the `docker` command-line tool from [Docker](https://docker.com/) for use in [t44](https://github.com/Stream44/t44).


Capsules: High Level
---

### `Project`

A curated API to build and run docker for a directory. Combines `Cli`, `Image` and `Container` capsules for a seamless developer experience.

Capsules: Low Level
---

### `Hub`

Utilities for working with [hub.docker.com](https://hub.docker.com).

### `Image`

Lifecycle methods for a **Docker Image**.

### `ImageContext`

Configurations for a spcific docker image.

### `Container`

Lifecycle methods for a **Docker Container**.

### `ContainerContext`

Configurations for a spcific docker container.

### `Cli`

Utility to wrap `docker` command-line tool.

### `Containers`

Utilities for working with containers in docker.


Provenance
===

[![Gordian Open Integrity](https://github.com/Stream44/t44-docker.com/actions/workflows/gordian-open-integrity.yaml/badge.svg)](https://github.com/Stream44/t44-docker.com/actions/workflows/gordian-open-integrity.yaml?query=branch%3Amain) [![DCO Signatures](https://github.com/Stream44/t44-docker.com/actions/workflows/dco.yaml/badge.svg)](https://github.com/Stream44/t44-docker.com/actions/workflows/dco.yaml?query=branch%3Amain)

Repository DID: `did:repo:e3a028ddf2e2061c350dc3146a22165b667d93eb`

<table>
  <tr>
    <td><strong>Inception Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-InceptionLifehash.svg" width="64" height="64"></td>
    <td><strong>Current Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-CurrentLifehash.svg" width="64" height="64"></td>
    <td>Trust established using<br/><a href="https://github.com/Stream44/t44-blockchaincommons.com">Stream44/t44-BlockchainCommons.com</a></td>
  </tr>
</table>

(c) 2026 [Christoph.diy](https://christoph.diy) • Code: [MIT](./LICENSE.txt) • Text: `CC-BY` • Created with [Stream44.Studio](https://Stream44.Studio)
