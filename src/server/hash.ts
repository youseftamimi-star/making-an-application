import { hash, verify } from "@node-rs/argon2";

// argon2id with library defaults (memory 19 MiB, t=2): well under 100 ms per check.
export const hashSecret = (plain: string) => hash(plain);
export const verifySecret = async (hashed: string, plain: string) => {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
};
