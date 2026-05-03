import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { AuthGate } from "../src/auth/auth-gate";
import { AuthProvider } from "../src/auth/auth-context";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Stack screenOptions={{ animation: "none", headerShown: false }} />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
