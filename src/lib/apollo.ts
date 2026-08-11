import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { nhost } from './nhost';

const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'lvxtjinpxcgopdtpnlop';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1';

const httpUrl = `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;
const wsUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

let clientInstance: ApolloClient | null = null;

export function getApolloClient() {
  if (clientInstance) return clientInstance;

  const httpLink = createHttpLink({
    uri: httpUrl,
    fetch: (url, options) => {
      const token = nhost.auth.getAccessToken();
      const headers = new Headers(options?.headers);
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return fetch(url, {
        ...options,
        headers,
      });
    },
  });

  if (typeof window === 'undefined') {
    return new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
    });
  }

  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
      connectionParams: () => {
        const token = nhost.auth.getAccessToken();
        return {
          headers: {
            authorization: token ? `Bearer ${token}` : '',
            'x-hasura-role': 'user',
          },
        };
      },
    })
  );

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'subscription'
      );
    },
    wsLink,
    httpLink
  );

  clientInstance = new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });

  return clientInstance;
}
