# Third-party notices

## Browser marks

The browser names and marks in Settings identify software installed on the device. Each trademark belongs to its owner.

- **Brave** uses the monochrome lion from Brave Software's Leo design system, revision `401210744dcf5eac7f6b4f26b8839e97d65b2929`. The local SVG preserves the path and inherits the theme foreground. This SVG is available under the Mozilla Public License 2.0. [Original SVG](https://github.com/brave/leo/blob/401210744dcf5eac7f6b4f26b8839e97d65b2929/icons/brave-icon-monochrome.svg) · [License](https://github.com/brave/leo/blob/401210744dcf5eac7f6b4f26b8839e97d65b2929/LICENSE.md)
- **Chromium** uses the Chromium Authors' product mark, revision `bfe4d0f3141035d46858b92f00807452ca7bf1e9`. The theme supplies the ink. Opacity distinguishes the original segments and the canvas shows through the center ring. [Original SVG](https://chromium.googlesource.com/chromium/src/+/bfe4d0f3141035d46858b92f00807452ca7bf1e9/chrome/app/theme/chromium/product_logo.svg) · [Bundled BSD license](packages/ui/src/assets/browsers/CHROMIUM-LICENSE.txt)
- **Chrome**, **Firefox**, and **Zen** use original focus. lettermarks CH, FX, and ZN. Google's brand guidance, Mozilla's compatibility guidance, and Zen's noncommercial logo license informed that choice. [Google product marks](https://about.google/brand-resource-center/products-and-services/) · [Mozilla trademark guidelines](https://www.mozilla.org/en-US/foundation/trademarks/policy/) · [Zen branding license](https://github.com/zen-browser/branding-archive)

## Grace mark

focus. uses Grace’s canonical unmodified SVG only to identify the **Start in Grace** action. [Grace source](https://github.com/samir-scripts/grace/blob/458ae9f5734854c481a127631ca8eb9e1bc5eb26/assets/brand/grace-mark.svg) (introduced by Samir Katakamsetty in `a7701fb`); [brand provenance](https://github.com/samir-scripts/grace/blob/458ae9f5734854c481a127631ca8eb9e1bc5eb26/assets/brand/README.md). Its [local copy](apps/desktop/src/assets/grace-mark.svg) has SHA-256 `3c4124ed9842c98b0f43a666b4d1993b7630b5f293310b87e7e38f4f9599fb13`. Grace distributes the repository under the [MIT license](https://github.com/samir-scripts/grace/blob/458ae9f5734854c481a127631ca8eb9e1bc5eb26/LICENSE):

> MIT License
>
> Copyright (c) 2018 Christopher Murphy
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Font Awesome Free brand icons

The YouTube, Instagram, X, Reddit, Facebook, TikTok, WhatsApp and Google icons in `packages/ui/src/SiteMark.svelte` are from Font Awesome Free 6.7.2, Copyright Fonticons, Inc. (https://fontawesome.com), licensed under Creative Commons Attribution 4.0 International: https://creativecommons.org/licenses/by/4.0/. Source: https://github.com/FortAwesome/Font-Awesome/tree/6.7.2/svgs/brands. The paths are unmodified and rendered in monochrome for theme contrast. Trademarks belong to their respective owners and identify services only, not affiliation or endorsement.

LinkedIn is represented by a neutral monogram rather than its logo: its [guidelines](https://brand.linkedin.com/in-logo) do not identify this catalog use as an allowed use. Custom sites use a neutral globe.

## Original print artwork

The vector paper grain and seeded particle shapes are original artwork from the approved focus. design study. The grain tile is editable SVG. Run `python3 apps/desktop/tools/build-paper-stock.py` to rebuild the three SVG flake tiles offline.

The Cobalt typewriter illustration adapts the [Grab3D Typewriter](https://grab3d.com/models/electronics/typewriter/) by Grab3D, published in Germany under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). focus. reworked the casing, keycaps, platen knobs and paper geometry and replaced the original textures with new flat ink shading, screening and grain. See the [source notice, pinned GLB and render recipe](docs/design/productivity/typewriter/README.md).

The standalone 3D.2 typewriter preview uses [Three.js 0.184.0](https://github.com/mrdoob/three.js/tree/r184), copyright © 2010–2026 three.js authors, under the [MIT license](https://github.com/mrdoob/three.js/blob/r184/LICENSE). Its offline HTML includes the full license. The keyboard's printed legends are rasterized from the project's Focus Bitmap Regular face. [Viewer provenance and recipes](docs/design/productivity/typewriter/README.md#slice-3d2--standalone-interactive-preview).

## Mona Sans and Mona Sans Mono

The bundled variable WOFF2 fonts were copied from the sibling Grace project, whose font provenance identifies the GitHub Mona Sans project: https://github.com/github/mona-sans. The fonts are distributed under the following license.

The separately named **Focus Bitmap Display** and **Focus Bitmap Wordmark** fonts are bitmap-outline derivatives of those same Mona fonts, distributed under the same SIL OFL. `python3.12 packages/ui/tools/build-bitmap-fonts.py` regenerates them offline with fontTools and Pillow (with WOFF2-capable FreeType). The **Focus Bitmap Regular** and **Bold** faces are original: their small letterforms come from the approved `focus-bitmap-particles.html` design study, with the rest of Basic Latin drawn to match.

Copyright (c) 2023, GitHub https://github.com/github/mona-sans
with Reserved Font Name "Mona Sans"

This Font Software is licensed under the SIL Open Font License, Version 1.1.

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
 development of collaborative font projects, to support the font creation
 efforts of academic and linguistic communities, and to provide a free and
 open framework in which fonts may be shared and improved in partnership
 with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting — in part or in whole — any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
