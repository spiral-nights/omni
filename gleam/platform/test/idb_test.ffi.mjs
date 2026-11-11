import fakeIndexedDB from "fake-indexeddb";
import { set_custom_indexeddb } from "./omni/platform/idb.ffi.mjs";

export function init_fake_indexeddb() {
  set_custom_indexeddb(fakeIndexedDB);
}
