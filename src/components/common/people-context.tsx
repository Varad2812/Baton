"use client";

import { createContext, useContext } from "react";

export type People = { owner: string; successor: string; reviewer: string };

const PeopleContext = createContext<People>({ owner: "the owner", successor: "the successor", reviewer: "the reviewer" });

/** First names of the project's handover people, so client labels never hardcode a persona. */
export function PeopleProvider({ value, children }: { value: People; children: React.ReactNode }) {
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export const usePeople = () => useContext(PeopleContext);
