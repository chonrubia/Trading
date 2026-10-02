"use client";
import dynamic from "next/dynamic";

const FloorApp = dynamic(() => import("../components/FloorApp"), { ssr: false });

export default function Page() {
  return <FloorApp />;
}
