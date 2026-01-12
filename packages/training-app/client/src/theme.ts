import { createTheme, MantineColorsTuple } from '@mantine/core';

const teal: MantineColorsTuple = [
  '#e6fcf9',
  '#d3f3ed',
  '#a8e5da',
  '#78d7c6',
  '#51cab5',
  '#38c2ab',
  '#26bea5',
  '#12a790',
  '#009580',
  '#00816e'
];

const orange: MantineColorsTuple = [
  '#fff4e6',
  '#ffe8cc',
  '#ffd8a8',
  '#ffc078',
  '#ffa94d',
  '#ff922b',
  '#fd7e14',
  '#f76707',
  '#e8590c',
  '#d9480f'
];

export const theme = createTheme({
  primaryColor: 'teal',
  colors: {
    teal,
    orange,
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    Card: {
      defaultProps: {
        shadow: 'sm',
        padding: 'lg',
        radius: 'md',
        withBorder: true,
      },
    },
  },
});
