import { Fragment } from 'react';
import type { TextProps } from 'react-native';

import type { NameIdPair } from '@/api/jellyfin';
import { openArtist } from '@/ui/nav';
import { T } from '@/ui/T';

/** Artist names where each one opens its artist page ("Tame Impala, Kali Uchis"). */
export function ArtistLinks({
  artists,
  fallback,
  variant = 'bodyStrong',
  ...rest
}: {
  artists?: NameIdPair[];
  fallback?: string;
  variant?: 'bodyStrong' | 'caption' | 'body';
} & Omit<TextProps, 'children'>) {
  const list = (artists ?? []).filter((a) => a.Id);
  if (list.length === 0) {
    return (
      <T variant={variant} {...rest}>
        {fallback ?? ''}
      </T>
    );
  }
  return (
    <T variant={variant} {...rest}>
      {list.map((a, i) => (
        <Fragment key={a.Id}>
          {i > 0 ? ', ' : ''}
          <T variant={variant} onPress={() => openArtist(a.Id)} suppressHighlighting>
            {a.Name}
          </T>
        </Fragment>
      ))}
    </T>
  );
}
