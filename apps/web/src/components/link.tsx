import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

export default function Link({
  href,
  ...props
}: Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { href: string }) {
  return <RouterLink to={href} {...props} />;
}
