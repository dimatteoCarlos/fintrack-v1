import { useCallback } from "react";
import { DictionaryDataType, getLangText, LanguageKeyType, TranslationValuesType, } from "../utils/languages";

export const useLanguageTranslation = (language:LanguageKeyType)=>{
// `values` is optional, so plain translateText(key) calls are unaffected; it fills
// the {placeholders} of entries that name something, such as an account name or an amount.
const translateText = useCallback(
(keyText: keyof DictionaryDataType, values?:TranslationValuesType)=>getLangText(language, keyText, values)
 ,[language]
)
 return {translateText}
}




