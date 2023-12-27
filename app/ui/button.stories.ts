import type { Meta, StoryObj } from '@storybook/react';
import Button from "./button";

const meta = {
  title: 'Glitter/Button',
  component: Button,
  tags: ['autodocs'],
}

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    disabled: false,
    intent: 'primary',
    outline: false,
    children: 'Button',
  },
};

export const Secondary: Story = {
  args: {
    disabled: false,
    intent: 'secondary',
    outline: false,
    children: 'Button',
  },
};

export const Accent: Story = {
  args: {
    disabled: false,
    intent: 'accent',
    outline: false,
    children: 'Button',
  },
};

export const PrimaryOutline: Story = {
  args: {
    disabled: false,
    intent: 'primary',
    outline: true,
    children: 'Button',
  },
};
