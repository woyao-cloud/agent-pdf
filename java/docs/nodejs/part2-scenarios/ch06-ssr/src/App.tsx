import React from 'react';

interface AppProps {
  user: { name: string; email: string };
  items: string[];
}

export function App({ user, items }: AppProps) {
  return (
    <html>
      <head><title>SSR Demo</title></head>
      <body>
        <div id="root">
          <h1>Hello, {user.name}!</h1>
          <p>Email: {user.email}</p>
          <h2>Your Items</h2>
          <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>
      </body>
    </html>
  );
}