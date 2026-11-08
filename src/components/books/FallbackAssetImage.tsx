import React, { ImgHTMLAttributes, useState } from 'react';

interface FallbackAssetImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src: string;
  fallbackSrc: string;
  onUnavailable: () => void;
}

export const FallbackAssetImage: React.FC<FallbackAssetImageProps> = ({
  src,
  fallbackSrc,
  onUnavailable,
  ...imageProps
}) => {
  const [fallbackForSource, setFallbackForSource] = useState<string | null>(null);
  const usingFallback = fallbackForSource === src;

  return (
    <img
      {...imageProps}
      src={usingFallback ? fallbackSrc : src}
      onError={() => {
        if (!usingFallback && fallbackSrc !== src) setFallbackForSource(src);
        else onUnavailable();
      }}
    />
  );
};
