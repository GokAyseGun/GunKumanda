// Gün Kumanda - Kotlin <-> C++ köprüsü (com.gunteknik.kumanda.ir.IrCore)
#include <jni.h>

#include <string>
#include <vector>

#include "ircore.h"

namespace {

std::string str(JNIEnv* env, jstring s) {
  if (!s) return "";
  const char* c = env->GetStringUTFChars(s, nullptr);
  std::string r(c ? c : "");
  if (c) env->ReleaseStringUTFChars(s, c);
  return r;
}

// Dönüş: [frekans, t0, t1, ...] ya da hata durumunda null
jintArray toArray(JNIEnv* env, const IrSignal& sig) {
  jsize n = static_cast<jsize>(sig.t.size() + 1);
  jintArray arr = env->NewIntArray(n);
  if (!arr) return nullptr;
  std::vector<jint> buf(n);
  buf[0] = static_cast<jint>(sig.freq);
  for (size_t i = 0; i < sig.t.size(); i++)
    buf[i + 1] = static_cast<jint>(sig.t[i] > 0x7FFFFFFF ? 0x7FFFFFFF
                                                         : sig.t[i]);
  env->SetIntArrayRegion(arr, 0, n, buf.data());
  return arr;
}

}  // namespace

extern "C" {

JNIEXPORT jintArray JNICALL
Java_com_gunteknik_kumanda_ir_IrCore_encodeAc(JNIEnv* env, jobject,
                                             jstring protocol, jint model,
                                             jintArray fields,
                                             jfloat degrees) {
  std::vector<int> f(kAcFieldCount, 0);
  jsize n = fields ? env->GetArrayLength(fields) : 0;
  if (n > 0) {
    std::vector<jint> tmp(n);
    env->GetIntArrayRegion(fields, 0, n, tmp.data());
    f.assign(tmp.begin(), tmp.end());
  }
  IrSignal sig;
  std::string err;
  if (!ircore_encode_ac(str(env, protocol), model, f.data(),
                        static_cast<int>(f.size()), degrees, &sig, &err))
    return nullptr;
  return toArray(env, sig);
}

JNIEXPORT jintArray JNICALL
Java_com_gunteknik_kumanda_ir_IrCore_encode(JNIEnv* env, jobject,
                                           jstring protocol, jstring value,
                                           jint bits, jint repeat) {
  IrSignal sig;
  std::string err;
  if (!ircore_encode(str(env, protocol), str(env, value), bits, repeat, &sig,
                     &err))
    return nullptr;
  return toArray(env, sig);
}

JNIEXPORT jstring JNICALL
Java_com_gunteknik_kumanda_ir_IrCore_decode(JNIEnv* env, jobject,
                                           jintArray timings) {
  jsize n = timings ? env->GetArrayLength(timings) : 0;
  std::vector<jint> tmp(n);
  if (n) env->GetIntArrayRegion(timings, 0, n, tmp.data());
  std::vector<uint32_t> t(tmp.begin(), tmp.end());
  std::string r = ircore_decode(t.data(), static_cast<int>(t.size()));
  return env->NewStringUTF(r.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_gunteknik_kumanda_ir_IrCore_acProtocols(JNIEnv* env, jobject) {
  return env->NewStringUTF(ircore_ac_protocols().c_str());
}

JNIEXPORT jstring JNICALL
Java_com_gunteknik_kumanda_ir_IrCore_protocols(JNIEnv* env, jobject) {
  return env->NewStringUTF(ircore_protocols().c_str());
}

}  // extern "C"
