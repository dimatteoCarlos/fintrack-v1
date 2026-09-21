// Typing for .svg imports, used either as a React component or as a URL string.
declare module '*.svg' {
  import * as React from "react";

// As a component: import { ReactComponent as Logo } from './logo.svg'

 export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;

  // As a string: import logoUrl from './logo.svg'
  const src: string;
  export default src;
}