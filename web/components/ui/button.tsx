import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const buttonVariants = cva(
  "button disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-teal-500",
  {
    variants: { variant: { default: "", outline: "secondary" } },
    defaultVariants: { variant: "default" },
  },
);
type Props = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    secondary?: boolean;
  };
export function Button({
  className,
  variant,
  secondary,
  asChild = false,
  ...props
}: Props) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={twMerge(
        clsx(
          buttonVariants({ variant: secondary ? "outline" : variant }),
          className,
        ),
      )}
      {...props}
    />
  );
}
