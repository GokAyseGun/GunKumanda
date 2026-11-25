// Her satırdaki ham sinyali çözer (veritabanı doğrulama aracı).
// Satır biçimi: "ENC <proto> <hex> <bits>" ya da "RAW t0 t1 ...".
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "ircore.h"
int main(){
  std::string line;
  while(std::getline(std::cin,line)){
    std::istringstream is(line); std::string kind; is>>kind;
    if(kind=="RAW"){
      std::vector<uint32_t> t; long v; while(is>>v) t.push_back((uint32_t)(v<0?-v:v));
      while(!t.empty() && t[0]>20000) t.erase(t.begin());
      // ilk çerçeveyi al: 40ms+ boşlukta kes
      std::vector<uint32_t> f; for(size_t i=0;i<t.size();i++){ f.push_back(t[i]); if(i%2==1 && t[i]>40000) break; }
      std::cout<<ircore_decode(f.data(),(int)f.size())<<"\n";
    } else if(kind=="ENC"){
      std::string p,h; int bits; is>>p>>h>>bits; IrSignal s; std::string e;
      if(!ircore_encode(p,h,bits,0,&s,&e)){ std::cout<<"{\"ok\":false,\"error\":\""<<e<<"\"}\n"; continue; }
      std::cout<<"{\"freq\":"<<s.freq<<",\"t\":["; for(size_t i=0;i<s.t.size();i++){ if(i) std::cout<<","; std::cout<<s.t[i]; } std::cout<<"]}\n";
    }
    std::cout.flush();
  }
}
