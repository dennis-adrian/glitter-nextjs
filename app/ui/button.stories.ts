import type { Meta, StoryObj } from '@storybook/react';
import Button from './button';
import { faPen } from '@fortawesome/free-solid-svg-icons';

const meta = {
  title: 'Glitter/Button',
  component: Button,
  tags: ['autodocs'],
} as Meta<typeof Button>;

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

export const Light: Story = {
  args: {
    disabled: false,
    intent: 'light',
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

export const SecondaryOutline: Story = {
  args: {
    disabled: false,
    intent: 'secondary',
    outline: true,
    children: 'Button',
  },
};

export const AccentOutline: Story = {
  args: {
    disabled: false,
    intent: 'accent',
    outline: true,
    children: 'Button',
  },
};

export const LightOutline: Story = {
  args: {
    disabled: false,
    intent: 'light',
    outline: true,
    children: 'Button',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    intent: 'primary',
    outline: false,
    children: 'Button',
  },
};

export const ButtonWithIcon: Story = {
  args: {
    disabled: false,
    intent: 'primary',
    outline: false,
    children: 'Button',
    icon: faPen,
  },
};

export const Ghost: Story = {
  args: {
    disabled: false,
    intent: 'ghost',
    outline: false,
    children: 'Button',
  },
};
