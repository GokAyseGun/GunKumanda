// Masaüstü testi: native çekirdeği Android'den bağımsız doğrular.
#include <cstdio>
#include <string>
#include "ircore.h"
static int fails = 0;
static std::string dec(const IrSignal& s){ return ircore_decode(s.t.data(), (int)s.t.size()); }
static void check(bool c, const std::string& m){ if(!c){ fails++; printf("FAIL %s\n", m.c_str()); } }
int main(){
  IrSignal s; std::string err;
  check(ircore_encode("NEC","0x00FFA25D",32,0,&s,&err),"NEC encode "+err);
  std::string d=dec(s); printf("NEC -> %s (n=%zu f=%u)\n", d.c_str(), s.t.size(), s.freq);
  check(d.find("\"NEC\"")!=std::string::npos && d.find("0xFFA25D")!=std::string::npos,"NEC roundtrip");
  check(ircore_encode("SAMSUNG","0xE0E040BF",32,0,&s,&err),"SAMSUNG"); check(dec(s).find("SAMSUNG")!=std::string::npos,"SAMSUNG rt");
  check(ircore_encode("RC5","0x80C",12,0,&s,&err),"RC5"); printf("RC5 -> %s\n",dec(s).c_str());
  check(ircore_encode("SONY","0xA90",12,2,&s,&err),"SONY"); printf("SONY -> %s\n",dec(s).c_str());
  std::string protos=ircore_ac_protocols(); printf("AC protos: %s\n", protos.c_str());
  int f[15]={1,1,1,0,-1,-1,0,0,0,0,0,0,0,-1,-1};
  // tüm klima protokollerini dene
  size_t p=1; int okc=0, rtc=0, total=0;
  while(true){ size_t q=protos.find('"',p); if(q==std::string::npos) break; size_t e=protos.find('"',q+1); std::string name=protos.substr(q+1,e-q-1); p=e+1; total++;
    IrSignal a; std::string er;
    if(!ircore_encode_ac(name,-1,f,15,24,&a,&er)){ printf("  AC %-22s ENCODE FAIL %s\n",name.c_str(),er.c_str()); fails++; continue; }
    okc++; std::string r=dec(a); bool rt=r.find("\"protocol\":\""+name+"\"")!=std::string::npos; if(rt) rtc++;
    printf("  AC %-22s n=%-4zu f=%-5u decode=%s\n",name.c_str(),a.t.size(),a.freq, rt?"OK":r.substr(0,60).c_str());
  }
  printf("AC encode %d/%d, roundtrip %d\n",okc,total,rtc);
  printf("fails=%d\n",fails); return fails?1:0;
}
