import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { App } from './App.js';
import type { ServerResponse } from 'node:http';

interface RenderOptions {
  user: { name: string; email: string };
  items: string[];
}

export function renderStream(options: RenderOptions, res: ServerResponse): void {
  const { pipe } = renderToPipeableStream(
    React.createElement(App, options),
    {
      onShellReady() {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        pipe(res);
      },
      onError(err) {
        console.error('SSR stream error:', err);
        res.statusCode = 500;
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.end('<h1>Internal Server Error</h1>');
      },
    },
  );
}

export function renderToString(options: RenderOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      React.createElement(App, options),
      {
        onShellReady() {
          const passThrough = new PassThrough();
          const chunks: Buffer[] = [];

          passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
          passThrough.on('end', () => resolve(Buffer.concat(chunks).toString()));
          passThrough.on('error', (err) => reject(err));

          pipe(passThrough);
        },
        onError(err) {
          reject(err);
        },
      },
    );
  });
}