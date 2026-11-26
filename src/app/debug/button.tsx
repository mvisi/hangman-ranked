"use client";

import { Button } from "@/components/ui/button";

const ActionButton = ({ func }: { func?: () => Promise<void> | void }) => {
  if (!func) {
    return (
      <Button
        onClick={() => {
          throw new Error("This is a client-side error for testing purposes.");
        }}
      >
        ThrowClientError
      </Button>
    );
  }
  return <Button onClick={() => void func()}>ThrowServerError</Button>;
};
export default ActionButton;
