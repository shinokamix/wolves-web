import React from 'react';

export default function Image({
  fill,
  priority,
  style,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  return (
    <img
      {...props}
      alt={props.alt || ''}
      loading={priority ? 'eager' : 'lazy'}
      style={
        fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style
      }
    />
  );
}
