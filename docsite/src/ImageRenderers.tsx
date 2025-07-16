// src/ImageRenderers.tsx
import type { DocsPageData, ImageRenderer } from '@acid-info/docusaurus-og'
import { readFileSync } from 'fs'
import { join } from 'path'
//import React from 'react'

export const docs: ImageRenderer<DocsPageData> = (data, context) => [
  <div style={{ display: 'flex', background: 'black', color: 'white' }}>
    {data.metadata.title}
  </div>,
  {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        data: readFileSync(
          join(__dirname, '../static/MartianMonoSemiCondensed-Light.ttf'),
        ),
        weight: 400,
        style: 'normal',
      },
    ],
  },
]