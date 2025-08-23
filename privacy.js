// PII Redaction + Controls
export function redactPII(text){
  if(!text) return text;
    return text
        // email
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[email]')
                // phone
                    .replace(/(\+?\d[\d\s\-]{6,}\d)/g,'[phone]')
                        // addresses (very light)
                            .replace(/\b(Jl\.?|Jalan|Rt|Rw|Desa|Kel\.|Kecamatan|Kab\.|Kabupaten|Kota)\b.*?(?=,|\.|$)/gi,'[address]')
                                // date
                                    .replace(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/g,'[date]');
                                    }

                                    export const PrivacyStore = {
                                      key: 'abelion_privacy',
                                        load(){ try{ return JSON.parse(localStorage.getItem(this.key)||'{}'); }catch{ return {} } },
                                          save(d){ localStorage.setItem(this.key, JSON.stringify(d||{})) },
                                            purge(){ localStorage.clear(); }
                                            }