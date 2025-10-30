import React from 'react';
// Import the original mapper
import MDXComponents from '@theme-original/MDXComponents';
import SchemaLink from "@site/src/components/SchemaLink";
import AIOExample from "@site/src/components/AIOExample";
import FileExample from "@site/src/components/FileExample";

export default {
  // Re-use the default mapping
  ...MDXComponents,
  SchemaLink,
  AIOExample,
  FileExample
};