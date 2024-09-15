import React from 'react';
import "../styles/globals.css";
import type { AppProps } from "next/app";
import { FileProvider } from "../context/FileContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <FileProvider>
      <Component {...pageProps} />
    </FileProvider>
  );
}
