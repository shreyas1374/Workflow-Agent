'use client';

import React, { useMemo } from 'react';
import { NhostProvider } from '@nhost/nextjs';
import { ApolloProvider } from '@apollo/client/react';
import { nhost } from '../lib/nhost';
import { getApolloClient } from '../lib/apollo';

export function Providers({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getApolloClient(), []);

  return (
    <NhostProvider nhost={nhost}>
      <ApolloProvider client={client}>
        {children}
      </ApolloProvider>
    </NhostProvider>
  );
}
