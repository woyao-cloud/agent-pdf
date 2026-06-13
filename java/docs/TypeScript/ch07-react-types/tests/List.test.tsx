import React from 'react';
import { render, screen } from '@testing-library/react';
import { List } from '../src/components/List';

describe('List', () => {
  const items = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ];

  it('should render all items', () => {
    render(
      <List
        items={items}
        keyExtractor={item => item.id}
        renderItem={item => <span>{item.name}</span>}
      />
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('should show empty message when no items', () => {
    render(
      <List
        items={[]}
        keyExtractor={item => item.id}
        renderItem={item => <span>{item.name}</span>}
        emptyMessage="Nothing here"
      />
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});
