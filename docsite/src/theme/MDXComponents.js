import React from 'react';
// Import the original mapper
import MDXComponents from '@theme-original/MDXComponents';
import SchemaLink from "@site/src/components/SchemaLink";
import DetailsAdmo from "@site/src/components/AdmonitionDetails";
import AIOExample from "@site/src/components/AIOExample";
import FileExample from "@site/src/components/FileExample";
import EnvType from "@site/src/components/snippets/_env-config.mdx";
import FileType from "@site/src/components/snippets/_file-config.mdx";
import AIOType from "@site/src/components/snippets/_aio-config.mdx";
import Config from "@site/src/components/GenericConfiguration.mdx";

export default {
  // Re-use the default mapping
  ...MDXComponents,
  SchemaLink,
  AIOExample,
  FileExample,
  EnvType,
  FileType,
  AIOType,
  Config,
  DetailsAdmo
};