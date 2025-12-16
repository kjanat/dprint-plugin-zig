#!/usr/bin/env -S deno run --allow-read
import { sortPackageJson } from "sort-package-json";

const input = await new Response(Deno.stdin.readable).text();
const sorted = sortPackageJson(input);
console.log(sortPackageJson(sorted));
