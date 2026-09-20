import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createMissingPerson, createSighting, getLocations, getMatches, getPeople, getSightings } from "./api";

const LanguageContext = createContext(null);


// Prototype auto-translation endpoint. This is the endpoint requested for this demo.
// It is not the documented Google Cloud Translation API, so it should be treated as
// a prototype/demo dependency rather than a production translation service.
const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single";

const LANGUAGE_CODES = {
  English: "en",
  Español: "es",
  Français: "fr"
};

const translationCache = new Map();

function normalizeTargetLanguage(language) {
  return LANGUAGE_CODES[language] || "en";
}

async function translateWithGoogle(text, targetLanguage) {
  const cleanText = String(text || "").replace(/\\s+/g, " ").trim();
  if (!cleanText || targetLanguage === "en") return text;

  const cacheKey = `${targetLanguage}::${cleanText}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLanguage,
    dt: "t",
    q: cleanText
  });

  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      mode: "cors",
      headers: {
        Accept: "application/json,text/plain,*/*"
      }
    });

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0]
          .map((part) => (Array.isArray(part) ? part[0] : ""))
          .filter(Boolean)
          .join("")
      : "";

    const result = translated || text;
    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Automatic translation failed:", error);
    return text;
  }
}

function shouldIgnoreTranslation(element) {
  if (!element) return true;

  return Boolean(
    element.closest?.(
      "script, style, noscript, option, textarea, [data-translate-ignore], .notranslate"
    )
  );
}

function collectTranslatableTextNodes(root, originalText, translatedNodes) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    const value = node.nodeValue || "";
    const trimmed = value.replace(/\\s+/g, " ").trim();

    if (!parent || !trimmed) continue;
    if (shouldIgnoreTranslation(parent)) continue;
    if (translatedNodes.has(node)) continue;

    // Leave tiny punctuation-only/numeric nodes alone.
    if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) continue;

    if (!originalText.has(node)) {
      originalText.set(node, value);
    }

    nodes.push(node);
  }

  return nodes;
}

function collectTranslatableAttributes(root, originals, translatedElements) {
  const elements = Array.from(
    root.querySelectorAll?.(
      "[placeholder], [aria-label], [title]"
    ) || []
  );

  return elements.filter((element) => {
    if (shouldIgnoreTranslation(element)) return false;
    if (translatedElements.has(element)) return false;

    return ["placeholder", "aria-label", "title"].some((attribute) => {
      const value = element.getAttribute(attribute);
      return value && /[A-Za-zÀ-ÿ]/.test(value);
    });
  }).map((element) => {
    if (!originals.has(element)) {
      originals.set(element, {
        placeholder: element.getAttribute("placeholder"),
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title")
      });
    }
    return element;
  });
}

function AutoTranslate({ language, children }) {
  const targetLanguage = normalizeTargetLanguage(language);
  const rootRef = useRef(null);
  const originalTextRef = useRef(new WeakMap());
  const originalAttributesRef = useRef(new WeakMap());
  const translatedNodesRef = useRef(new WeakSet());
  const translatedElementsRef = useRef(new WeakSet());
  const internalTextMutationsRef = useRef(new WeakSet());
  const internalAttributeMutationsRef = useRef(new WeakSet());
  const runIdRef = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const runId = ++runIdRef.current;

    const restoreOriginals = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (originalTextRef.current.has(node)) {
          internalTextMutationsRef.current.add(node);
          node.nodeValue = originalTextRef.current.get(node);
          translatedNodesRef.current.delete(node);
        }
      }

      root.querySelectorAll?.("[placeholder], [aria-label], [title]")
        .forEach((element) => {
          const originals = originalAttributesRef.current.get(element);
          if (!originals) return;

          [
            ["placeholder", originals.placeholder],
            ["aria-label", originals.ariaLabel],
            ["title", originals.title]
          ].forEach(([attribute, value]) => {
            if (value == null) return;
            internalAttributeMutationsRef.current.add(element);
            element.setAttribute(attribute, value);
          });

          translatedElementsRef.current.delete(element);
        });
    };

    const translateTextNodes = async () => {
      if (runIdRef.current !== runId) return;

      const nodes = collectTranslatableTextNodes(
        root,
        originalTextRef.current,
        translatedNodesRef.current
      );

      const unique = new Map();
      for (const node of nodes) {
        const original = originalTextRef.current.get(node) || node.nodeValue || "";
        const key = original.replace(/\\s+/g, " ").trim();
        if (!key) continue;
        if (!unique.has(key)) unique.set(key, []);
        unique.get(key).push(node);
      }

      // Keep the number of simultaneous requests modest.
      const entries = Array.from(unique.entries());
      let index = 0;
      const worker = async () => {
        while (index < entries.length) {
          const current = entries[index++];
          const text = current[0];
          const matchingNodes = current[1];
          const translated = await translateWithGoogle(text, targetLanguage);

          if (runIdRef.current !== runId) return;

          for (const node of matchingNodes) {
            internalTextMutationsRef.current.add(node);
            node.nodeValue = translated;
            translatedNodesRef.current.add(node);
          }
        }
      };

      await Promise.all([worker(), worker(), worker(), worker()]);
    };

    const translateAttributes = async () => {
      const elements = collectTranslatableAttributes(
        root,
        originalAttributesRef.current,
        translatedElementsRef.current
      );

      const jobs = [];
      for (const element of elements) {
        const originals = originalAttributesRef.current.get(element);
        if (!originals) continue;

        for (const [attribute, value] of [
          ["placeholder", originals.placeholder],
          ["aria-label", originals.ariaLabel],
          ["title", originals.title]
        ]) {
          if (!value || !/[A-Za-zÀ-ÿ]/.test(value)) continue;

          jobs.push((async () => {
            const translated = await translateWithGoogle(value, targetLanguage);
            if (runIdRef.current !== runId) return;

            internalAttributeMutationsRef.current.add(element);
            element.setAttribute(attribute, translated);
          })());
        }

        translatedElementsRef.current.add(element);
      }

      await Promise.all(jobs);
    };

    const run = async () => {
      restoreOriginals();

      if (targetLanguage === "en") {
        return;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (runIdRef.current !== runId) return;

      await Promise.all([
        translateTextNodes(),
        translateAttributes()
      ]);
    };

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (runIdRef.current !== runId) return;
        run();
      });
    };

    const observer = new MutationObserver((mutations) => {
      let shouldRun = false;

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const node = mutation.target;
          if (internalTextMutationsRef.current.has(node)) {
            internalTextMutationsRef.current.delete(node);
            continue;
          }

          // React changed a previously translated node. Treat the new text as the
          // new source text, then translate it into the current language.
          if (translatedNodesRef.current.has(node)) {
            translatedNodesRef.current.delete(node);
            originalTextRef.current.set(node, node.nodeValue || "");
          }
          shouldRun = true;
        }

        if (mutation.type === "attributes") {
          const element = mutation.target;
          if (internalAttributeMutationsRef.current.has(element)) {
            internalAttributeMutationsRef.current.delete(element);
            continue;
          }

          if (translatedElementsRef.current.has(element)) {
            const originals = originalAttributesRef.current.get(element) || {};
            const attribute = mutation.attributeName;
            if (attribute === "placeholder") originals.placeholder = element.getAttribute(attribute);
            if (attribute === "aria-label") originals.ariaLabel = element.getAttribute(attribute);
            if (attribute === "title") originals.title = element.getAttribute(attribute);
            originalAttributesRef.current.set(element, originals);
            translatedElementsRef.current.delete(element);
          }
          shouldRun = true;
        }

        if (mutation.type === "childList" && mutation.addedNodes.length) {
          shouldRun = true;
        }
      }

      if (shouldRun && targetLanguage !== "en") {
        schedule();
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"]
    });

    run();

    return () => {
      observer.disconnect();
    };
  }, [targetLanguage]);

  return <div ref={rootRef}>{children}</div>;
}

const translations = {
  English: {
    nav: {
      home: "Home",
      report: "File Report",
      find: "Find Person",
      contact: "Contact",
      about: "About",
      homeAria: "Reunite home",
      main: "Main navigation",
      secondary: "Secondary navigation",
      language: "Language"
    },
    home: {
      heroAlt: "Reunite",
      tagline: "Helping families find the people they love.",
      findButton: "Find a Person",
      reportButton: "File a Missing Person Report",
      how: "HOW IT WORKS",
      introTitle: "One place to search, report, and reconnect.",
      introText:
        "Reunite lets people submit missing-person reports and search existing reports using information such as name, age, location, description, clothing, and photos.",
      step1Title: "File a report",
      step1Text: "Add the missing person's details and the last known sighting.",
      step2Title: "Find a person",
      step2Text: "Search reports and compare potential matches.",
      step3Title: "Report a sighting",
      step3Text: "Share useful information with the person who filed the report.",
      viewAll: "View all results →",
      helpEyebrow: "HELP SOMEONE GET HOME",
      helpTitle: "Have information about a missing person?",
      helpText: "Even a small detail may help connect a family with their loved one.",
      searchReports: "Search reports",
      sightingsEyebrow: "COMMUNITY REPORTS",
      sightingsTitle: "Recent sightings",
      sightingsText: "New information shared by people in the community. These reports still need human review.",
      sightingsCount: "reports",
      unknownPerson: "Name not provided",
      unknownLocation: "Location not provided",
      noDescription: "No description provided.",
      noSightings: "No sightings have been submitted yet.",
      contextEyebrow: "WHY WE BUILT THIS",
      contextTitle: "Responding to the flooding in Nepal",
      contextText1: "Nepal's monsoon season brings recurring floods and landslides that damage roads, disrupt phone networks, and force entire communities to evacuate on short notice. In the chaos, families are often separated with no reliable way to learn who is safe or where to look for a loved one.",
      contextText2: "Reunite gives families, volunteers, and aid workers a shared place to report someone missing, log sightings from the field, and reconnect people once it's safe to do so. It doesn't replace emergency services — it's a lightweight tool to close the information gap while official response efforts are underway."
    },
    search: {
      eyebrow: "SEARCH",
      title: "Find a missing person",
      subtitle: "Search the available reports and review potential matches.",
      name: "Name",
      age: "Approximate age",
      location: "Location",
      sort: "Sort by",
      namePlaceholder: "e.g. Sunita Lama",
      agePlaceholder: "e.g. 34",
      locationPlaceholder: "e.g. Kathmandu",
      highestMatch: "Highest match",
      ageOption: "Age",
      nameOption: "Name",
      results: "Search Results",
      oneMatch: "We found 1 potential match.",
      manyMatches: "We found {count} potential matches.",
      noReports: "No matching reports",
      tryAgain: "Try changing the name, age, or location.",
      startSearching: "Enter a name, age, or location to search reports."
    },
    card: {
      match: "Match",
      lastSeen: "Last seen:",
      location: "Location:",
      details: "View details →"
    },
    person: {
      back: "← Back to search results",
      why: "Why this match?",
      details: "Details",
      lastSeen: "Last seen",
      location: "Location",
      description: "Description",
      verifying: "Currently being verified",
      reviewing: "Report is being reviewed",
      reported: "This person has been reported {count} times.",
      reportSighting: "Report a Sighting",
      sightingTitle: "Report a sighting",
      sightingText: "Share what you know about {name}.",
      where: "Where did you see them?",
      wherePlaceholder: "City, address, or landmark",
      when: "When did you see them?",
      additional: "Additional details",
      additionalPlaceholder: "Clothing, direction of travel, vehicle, etc.",
      submit: "Submit Sighting",
      thankYou: "Thank you",
      submitted: "Your sighting has been submitted for review.",
      close: "Close"
    },
    report: {
      eyebrow: "FILE REPORT",
      title: "Report a missing person",
      subtitle: "Provide as much accurate information as possible so people can help.",
      reporterInfo: "Reporter information",
      yourName: "Your name *",
      phone: "Phone number *",
      missingInfo: "Missing person information",
      fullName: "Full name *",
      ageRange: "Age range",
      agePlaceholder: "e.g. 25-30",
      gender: "Gender",
      select: "Select",
      female: "Female",
      male: "Male",
      nonBinary: "Non-binary",
      unknown: "Unknown",
      lastLocation: "Last known location *",
      dateLastSeen: "Date last seen *",
      timeLastSeen: "Time last seen",
      description: "Description",
      descriptionPlaceholder: "Hair color, height, identifying features, etc.",
      clothing: "Clothing / items",
      clothingPlaceholder: "What were they wearing? Did they have a backpack, phone, vehicle, etc.?",
      photo: "Photo",
      photoHelp: "For this demo, the file is selected locally and is not uploaded to a server.",
      requiredError: "Please complete the required fields marked with *.",
      submitReport: "Submit Missing Person Report"
    },
    reports: {
      eyebrow: "REPORTS",
      title: "Submitted reports",
      subtitle: "This demo stores reports only in the current browser session.",
      none: "No reports submitted yet",
      noneText: "Use File Report to create your first report.",
      submitted: "SUBMITTED",
      lastKnown: "Last known location:",
      lastSeen: "Last seen:"
    },
    contact: {
      eyebrow: "CONTACT",
      title: "Get in touch",
      subtitle: "Questions about a report or how Reunite works?",
      support: "Reunite Support",
      email: "Email:",
      phone: "Phone:",
      notice: "If someone is in immediate danger, contact local emergency services.This website is a supplment to already available resources."
    },
    about: {
      eyebrow: "ABOUT",
      title: "About Reunite",
      subtitle: "A lightweight tool built to help families and aid workers find missing loved ones during Nepal's flooding crisis.",
      searchTitle: "Search",
      searchText: "Search reports using names, age, location, descriptions, and other details.",
      reportsTitle: "Reports",
      reportsText: "Keep missing-person information organized in one place.",
      communityTitle: "Community",
      communityText: "Allow people to submit useful sighting information."
    },
    footer: {
      tagline: "Helping families find the people they love.",
      copyright: "© 2026 Reunite"
    },
    common: {
      name: "Name",
      location: "Location",
      description: "Description",
      photo: "Photo",
      clothing: "Clothing",
      exactName: "Name similarity (exact match)",
      nameSimilarity: "Name similarity",
      photoSimilarity: "Photo similarity",
      locationRiverside: "Location (Riverside, CA)",
      descriptionMaria: "Description (brown hair, blue jacket)",
      descriptionMariaShort: "Brown hair, blue jacket, backpack",
      descriptionJohn: "Dark hair, beard, gray jacket",
      descriptionEmily: "Brown hair, light jacket, backpack",
      descriptionAsha: "Long dark hair, teal rain jacket, small backpack",
      descriptionKiran: "Dark hair, black vest, glasses, reusable water bottle",
      descriptionMaya: "Dark hair tied back, black top, silver earrings",
      descriptionRamesh: "Short dark hair, gray shirt, navy jacket",
      descriptionSita: "Dark hair, maroon scarf, light sweater",
      descriptionDipak: "Short dark hair, blue shirt, black backpack",
      descriptionNirmala: "Gray hair, pink sweater, patterned trousers",
      descriptionBikash: "Dark hair, rain jacket, dark trousers",
      descriptionSunita: "Dark hair, purple scarf, brown long-sleeve top",
      descriptionPrakash: "Gray hair, dark jacket, glasses",
      descriptionAnita: "Long dark hair, white sweater, blue backpack",
      descriptionHari: "White beard, traditional topi, purple shirt",
      locationRasuwa: "Location (Rasuwa, Nepal)",
      locationNuwakot: "Location (Nuwakot, Nepal)",
      locationKathmandu: "Location (Kathmandu, Nepal)",
      locationDhading: "Location (Dhading, Nepal)",
      locationSindhupalchok: "Location (Sindhupalchok, Nepal)",
      locationBhaktapur: "Location (Bhaktapur, Nepal)",
      locationLalitpur: "Location (Lalitpur, Nepal)",
      locationKaski: "Location (Kaski, Nepal)",
      locationChitwan: "Location (Chitwan, Nepal)"
    },
    gender: {
      female: "Female",
      male: "Male"
    }
  },
  Español: {
    nav: {
      home: "Inicio",
      report: "Presentar reporte",
      find: "Buscar persona",
      contact: "Contacto",
      about: "Acerca de",
      homeAria: "Página de inicio de Reunite",
      main: "Navegación principal",
      secondary: "Navegación secundaria",
      language: "Idioma"
    },
    home: {
      heroAlt: "Reunite",
      tagline: "Ayudamos a las familias a encontrar a las personas que aman.",
      findButton: "Buscar una persona",
      reportButton: "Presentar un reporte de persona desaparecida",
      how: "CÓMO FUNCIONA",
      introTitle: "Un solo lugar para buscar, reportar y volver a conectar.",
      introText:
        "Reunite permite enviar reportes de personas desaparecidas y buscar reportes existentes usando datos como nombre, edad, ubicación, descripción, ropa y fotografías.",
      step1Title: "Presentar un reporte",
      step1Text: "Agrega los datos de la persona desaparecida y el último lugar donde fue vista.",
      step2Title: "Buscar una persona",
      step2Text: "Busca reportes y compara posibles coincidencias.",
      step3Title: "Reportar un avistamiento",
      step3Text: "Comparte información útil con la persona que presentó el reporte.",
      findPersonEyebrow: "BUSCAR PERSONA",
      potentialMatches: "Posibles coincidencias",
      viewAll: "Ver todos los resultados →",
      helpEyebrow: "AYUDA A ALGUIEN A REGRESAR A CASA",
      helpTitle: "¿Tienes información sobre una persona desaparecida?",
      helpText: "Incluso un pequeño detalle puede ayudar a conectar a una familia con su ser querido.",
      searchReports: "Buscar reportes"
    },
    search: {
      eyebrow: "BÚSQUEDA",
      title: "Buscar una persona desaparecida",
      subtitle: "Busca los reportes disponibles y revisa posibles coincidencias.",
      name: "Nombre",
      age: "Edad aproximada",
      location: "Ubicación",
      sort: "Ordenar por",
      namePlaceholder: "p. ej. Maria Lopez",
      agePlaceholder: "p. ej. 34",
      locationPlaceholder: "p. ej. Riverside",
      highestMatch: "Mayor coincidencia",
      ageOption: "Edad",
      nameOption: "Nombre",
      results: "Resultados de búsqueda",
      oneMatch: "Encontramos 1 posible coincidencia.",
      manyMatches: "Encontramos {count} posibles coincidencias.",
      noReports: "No hay reportes coincidentes",
      tryAgain: "Intenta cambiar el nombre, la edad o la ubicación."
    },
    card: {
      match: "Coincidencia",
      lastSeen: "Última vez visto:",
      location: "Ubicación:",
      details: "Ver detalles →"
    },
    person: {
      back: "← Volver a los resultados",
      why: "¿Por qué coincide?",
      details: "Detalles",
      lastSeen: "Última vez visto",
      location: "Ubicación",
      description: "Descripción",
      verifying: "Actualmente en verificación",
      reviewing: "El reporte está siendo revisado",
      reported: "Esta persona ha sido reportada {count} veces.",
      reportSighting: "Reportar un avistamiento",
      sightingTitle: "Reportar un avistamiento",
      sightingText: "Comparte lo que sabes sobre {name}.",
      where: "¿Dónde la viste?",
      wherePlaceholder: "Ciudad, dirección o punto de referencia",
      when: "¿Cuándo la viste?",
      additional: "Detalles adicionales",
      additionalPlaceholder: "Ropa, dirección de viaje, vehículo, etc.",
      submit: "Enviar avistamiento",
      thankYou: "Gracias",
      submitted: "Tu avistamiento ha sido enviado para revisión.",
      close: "Cerrar"
    },
    report: {
      eyebrow: "PRESENTAR REPORTE",
      title: "Reportar una persona desaparecida",
      subtitle: "Proporciona la mayor cantidad de información precisa posible para que otros puedan ayudar.",
      reporterInfo: "Información de quien reporta",
      yourName: "Tu nombre *",
      phone: "Número de teléfono *",
      missingInfo: "Información de la persona desaparecida",
      fullName: "Nombre completo *",
      ageRange: "Rango de edad",
      agePlaceholder: "p. ej. 25-30",
      gender: "Género",
      select: "Seleccionar",
      female: "Mujer",
      male: "Hombre",
      nonBinary: "No binario",
      unknown: "Desconocido",
      lastLocation: "Última ubicación conocida *",
      dateLastSeen: "Fecha de la última vez visto *",
      timeLastSeen: "Hora de la última vez visto",
      description: "Descripción",
      descriptionPlaceholder: "Color de cabello, altura, rasgos distintivos, etc.",
      clothing: "Ropa / objetos",
      clothingPlaceholder: "¿Qué llevaba puesto? ¿Tenía mochila, teléfono, vehículo, etc.?",
      photo: "Fotografía",
      photoHelp: "En esta demostración, el archivo se selecciona localmente y no se sube a un servidor.",
      requiredError: "Completa los campos obligatorios marcados con *.",
      submitReport: "Enviar reporte de persona desaparecida"
    },
    reports: {
      eyebrow: "REPORTES",
      title: "Reportes enviados",
      subtitle: "Esta demostración guarda los reportes solo durante la sesión actual del navegador.",
      none: "Aún no hay reportes",
      noneText: "Usa Presentar reporte para crear tu primer reporte.",
      submitted: "ENVIADO",
      lastKnown: "Última ubicación conocida:",
      lastSeen: "Última vez visto:"
    },
    contact: {
      eyebrow: "CONTACTO",
      title: "Ponte en contacto",
      subtitle: "¿Preguntas sobre un reporte o sobre cómo funciona Reunite?",
      support: "Soporte de Reunite",
      email: "Correo:",
      phone: "Teléfono:",
      notice: "Si alguien está en peligro inmediato, contacta a los servicios de emergencia locales en lugar de depender de este sitio web."
    },
    about: {
      eyebrow: "ACERCA DE",
      title: "Acerca de Reunite",
      subtitle: "Una herramienta sencilla creada para ayudar a familias y trabajadores humanitarios a encontrar a sus seres queridos durante la crisis de inundaciones en Nepal.",
      searchTitle: "Búsqueda",
      searchText: "Busca reportes usando nombres, edad, ubicación, descripciones y otros detalles.",
      reportsTitle: "Reportes",
      reportsText: "Mantén organizada la información de personas desaparecidas en un solo lugar.",
      communityTitle: "Comunidad",
      communityText: "Permite que las personas envíen información útil sobre avistamientos."
    },
    footer: {
      tagline: "Ayudamos a las familias a encontrar a las personas que aman.",
      copyright: "© 2026 Reunite · Proyecto de demostración"
    },
    common: {
      name: "Nombre",
      location: "Ubicación",
      description: "Descripción",
      photo: "Fotografía",
      clothing: "Ropa",
      exactName: "Similitud del nombre (coincidencia exacta)",
      nameSimilarity: "Similitud del nombre",
      photoSimilarity: "Similitud de la fotografía",
      locationRiverside: "Ubicación (Riverside, CA)",
      descriptionMaria: "Descripción (cabello castaño, chaqueta azul)",
      descriptionMariaShort: "Cabello castaño, chaqueta azul, mochila",
      descriptionJohn: "Cabello oscuro, barba, chaqueta gris",
      descriptionEmily: "Cabello castaño, chaqueta clara, mochila"
    },
    gender: {
      female: "Mujer",
      male: "Hombre"
    }
  },
  Français: {
    nav: {
      home: "Accueil",
      report: "Signaler",
      find: "Rechercher une personne",
      contact: "Contact",
      about: "À propos",
      homeAria: "Accueil de Reunite",
      main: "Navigation principale",
      secondary: "Navigation secondaire",
      language: "Langue"
    },
    home: {
      heroAlt: "Reunite",
      tagline: "Aider les familles à retrouver les personnes qu'elles aiment.",
      findButton: "Rechercher une personne",
      reportButton: "Signaler une personne disparue",
      how: "COMMENT ÇA MARCHE",
      introTitle: "Un seul endroit pour rechercher, signaler et se retrouver.",
      introText:
        "Reunite permet d'envoyer des signalements de personnes disparues et de rechercher des signalements existants à l'aide du nom, de l'âge, du lieu, de la description, des vêtements et des photos.",
      step1Title: "Déposer un signalement",
      step1Text: "Ajoutez les informations de la personne disparue et le dernier lieu où elle a été vue.",
      step2Title: "Rechercher une personne",
      step2Text: "Recherchez les signalements et comparez les correspondances possibles.",
      step3Title: "Signaler une observation",
      step3Text: "Partagez des informations utiles avec la personne qui a déposé le signalement.",
      findPersonEyebrow: "RECHERCHER UNE PERSONNE",
      potentialMatches: "Correspondances possibles",
      viewAll: "Voir tous les résultats →",
      helpEyebrow: "AIDER QUELQU'UN À RENTRER CHEZ SOI",
      helpTitle: "Avez-vous des informations sur une personne disparue ?",
      helpText: "Même un petit détail peut aider une famille à retrouver son proche.",
      searchReports: "Rechercher des signalements"
    },
    search: {
      eyebrow: "RECHERCHE",
      title: "Rechercher une personne disparue",
      subtitle: "Recherchez les signalements disponibles et examinez les correspondances possibles.",
      name: "Nom",
      age: "Âge approximatif",
      location: "Lieu",
      sort: "Trier par",
      namePlaceholder: "ex. Maria Lopez",
      agePlaceholder: "ex. 34",
      locationPlaceholder: "ex. Riverside",
      highestMatch: "Meilleure correspondance",
      ageOption: "Âge",
      nameOption: "Nom",
      results: "Résultats de recherche",
      oneMatch: "1 correspondance possible trouvée.",
      manyMatches: "{count} correspondances possibles trouvées.",
      noReports: "Aucun signalement correspondant",
      tryAgain: "Essayez de modifier le nom, l'âge ou le lieu."
    },
    card: {
      match: "Correspondance",
      lastSeen: "Dernière fois vu :",
      location: "Lieu :",
      details: "Voir les détails →"
    },
    person: {
      back: "← Retour aux résultats",
      why: "Pourquoi cette correspondance ?",
      details: "Détails",
      lastSeen: "Dernière fois vu",
      location: "Lieu",
      description: "Description",
      verifying: "Vérification en cours",
      reviewing: "Le signalement est en cours d'examen",
      reported: "Cette personne a été signalée {count} fois.",
      reportSighting: "Signaler une observation",
      sightingTitle: "Signaler une observation",
      sightingText: "Partagez ce que vous savez sur {name}.",
      where: "Où l'avez-vous vue ?",
      wherePlaceholder: "Ville, adresse ou lieu connu",
      when: "Quand l'avez-vous vue ?",
      additional: "Détails supplémentaires",
      additionalPlaceholder: "Vêtements, direction, véhicule, etc.",
      submit: "Envoyer l'observation",
      thankYou: "Merci",
      submitted: "Votre observation a été envoyée pour examen.",
      close: "Fermer"
    },
    report: {
      eyebrow: "SIGNALER",
      title: "Signaler une personne disparue",
      subtitle: "Fournissez autant d'informations précises que possible afin que les autres puissent aider.",
      reporterInfo: "Informations sur le déclarant",
      yourName: "Votre nom *",
      phone: "Numéro de téléphone *",
      missingInfo: "Informations sur la personne disparue",
      fullName: "Nom complet *",
      ageRange: "Tranche d'âge",
      agePlaceholder: "ex. 25-30",
      gender: "Genre",
      select: "Sélectionner",
      female: "Femme",
      male: "Homme",
      nonBinary: "Non binaire",
      unknown: "Inconnu",
      lastLocation: "Dernier lieu connu *",
      dateLastSeen: "Date de la dernière fois vue *",
      timeLastSeen: "Heure de la dernière fois vue",
      description: "Description",
      descriptionPlaceholder: "Couleur des cheveux, taille, signes distinctifs, etc.",
      clothing: "Vêtements / objets",
      clothingPlaceholder: "Que portait-elle ? Avait-elle un sac, un téléphone, un véhicule, etc. ?",
      photo: "Photo",
      photoHelp: "Dans cette démonstration, le fichier est sélectionné localement et n'est pas envoyé à un serveur.",
      requiredError: "Veuillez remplir les champs obligatoires marqués d'un *.",
      submitReport: "Envoyer le signalement de personne disparue"
    },
    reports: {
      eyebrow: "SIGNALEMENTS",
      title: "Signalements envoyés",
      subtitle: "Cette démonstration conserve les signalements uniquement pendant la session actuelle du navigateur.",
      none: "Aucun signalement envoyé",
      noneText: "Utilisez Signaler pour créer votre premier signalement.",
      submitted: "ENVOYÉ",
      lastKnown: "Dernier lieu connu :",
      lastSeen: "Dernière fois vu :"
    },
    contact: {
      eyebrow: "CONTACT",
      title: "Nous contacter",
      subtitle: "Des questions sur un signalement ou sur le fonctionnement de Reunite ?",
      support: "Assistance Reunite",
      email: "E-mail :",
      phone: "Téléphone :",
      notice: "Si quelqu'un est en danger immédiat, contactez les services d'urgence locaux plutôt que de compter sur ce site web."
    },
    about: {
      eyebrow: "À PROPOS",
      title: "À propos de Reunite",
      subtitle: "Un outil simple conçu pour aider les familles et les travailleurs humanitaires à retrouver leurs proches pendant la crise des inondations au Népal.",
      searchTitle: "Recherche",
      searchText: "Recherchez des signalements à l'aide des noms, de l'âge, du lieu, des descriptions et d'autres détails.",
      reportsTitle: "Signalements",
      reportsText: "Gardez les informations sur les personnes disparues organisées au même endroit.",
      communityTitle: "Communauté",
      communityText: "Permettez aux utilisateurs de transmettre des informations utiles sur des observations."
    },
    footer: {
      tagline: "Aider les familles à retrouver les personnes qu'elles aiment.",
      copyright: "© 2026 Reunite · Projet de démonstration"
    },
    common: {
      name: "Nom",
      location: "Lieu",
      description: "Description",
      photo: "Photo",
      clothing: "Vêtements",
      exactName: "Similitude du nom (correspondance exacte)",
      nameSimilarity: "Similitude du nom",
      photoSimilarity: "Similitude de la photo",
      locationRiverside: "Lieu (Riverside, CA)",
      descriptionMaria: "Description (cheveux bruns, veste bleue)",
      descriptionMariaShort: "Cheveux bruns, veste bleue, sac à dos",
      descriptionJohn: "Cheveux foncés, barbe, veste grise",
      descriptionEmily: "Cheveux bruns, veste claire, sac à dos"
    },
    gender: {
      female: "Femme",
      male: "Homme"
    }
  }
};

function getTranslation(language, path, variables = {}) {
  const source = translations[language] || translations.English;
  const value = path.split(".").reduce((obj, key) => obj?.[key], source);
  let text = value ?? path;
  Object.entries(variables).forEach(([key, replacement]) => {
    text = text.replace(`{${key}}`, replacement);
  });
  return text;
}

function LanguageProvider({ language, children }) {
  // English is the source language. AutoTranslate converts whatever is rendered
  // into the language selected by the user.
  const t = (path, variables) => getTranslation("English", path, variables);
  return (
    <LanguageContext.Provider value={{ language, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

function useLanguage() {
  return useContext(LanguageContext);
}

const people = [
  {
    id: 1,
    name: "Asha Thapa",
    age: 27,
    genderKey: "female",
    lastSeen: "August 27, 2026",
    location: "Rasuwa, Nepal",
    descriptionKey: "descriptionAsha",
    tags: ["name", "location", "description", "photo"],
    match: 94,
    photo: "https://images.unsplash.com/photo-1708364171243-c46bc85b2b90?auto=format&fit=crop&w=900&q=85",
    reported: 9,
    verified: true,
    why: [
      ["exactName", "28%"],
      ["locationRasuwa", "24%"],
      ["descriptionAsha", "20%"],
      ["photoSimilarity", "22%"]
    ]
  },
  {
    id: 2,
    name: "Kiran Tamang",
    age: 34,
    genderKey: "male",
    lastSeen: "August 28, 2026",
    location: "Nuwakot, Nepal",
    descriptionKey: "descriptionKiran",
    tags: ["name", "location", "description", "photo"],
    match: 88,
    photo: "https://images.unsplash.com/photo-1708364171715-16eaf0b2d8dc?auto=format&fit=crop&w=900&q=85",
    reported: 14,
    verified: true,
    why: [
      ["nameSimilarity", "24%"],
      ["locationNuwakot", "23%"],
      ["descriptionKiran", "21%"],
      ["photoSimilarity", "20%"]
    ]
  },
  {
    id: 3,
    name: "Maya Gurung",
    age: 31,
    genderKey: "female",
    lastSeen: "August 29, 2026",
    location: "Kathmandu, Nepal",
    descriptionKey: "descriptionMaya",
    tags: ["name", "location", "description", "photo"],
    match: 82,
    photo: "https://images.unsplash.com/photo-1708364171781-68810d2adb94?auto=format&fit=crop&w=900&q=85",
    reported: 8,
    verified: false,
    why: [
      ["nameSimilarity", "23%"],
      ["locationKathmandu", "22%"],
      ["descriptionMaya", "19%"],
      ["photoSimilarity", "18%"]
    ]
  },
  {
    id: 4,
    name: "Ramesh Shrestha",
    age: 41,
    genderKey: "male",
    lastSeen: "August 30, 2026",
    location: "Dhading, Nepal",
    descriptionKey: "descriptionRamesh",
    tags: ["name", "location", "description"],
    match: 78,
    photo: "https://images.unsplash.com/photo-1585718540843-11b15b63a18f?auto=format&fit=crop&w=900&q=85",
    reported: 6,
    verified: false,
    why: [
      ["nameSimilarity", "21%"],
      ["locationDhading", "20%"],
      ["descriptionRamesh", "18%"],
      ["photoSimilarity", "19%"]
    ]
  },
  {
    id: 5,
    name: "Sita Rai",
    age: 22,
    genderKey: "female",
    lastSeen: "August 31, 2026",
    location: "Sindhupalchok, Nepal",
    descriptionKey: "descriptionSita",
    tags: ["name", "location", "clothing"],
    match: 74,
    photo: "https://images.unsplash.com/photo-1671770324841-6cbc0cccb93d?auto=format&fit=crop&w=900&q=85",
    reported: 5,
    verified: false,
    why: [
      ["nameSimilarity", "20%"],
      ["locationSindhupalchok", "21%"],
      ["descriptionSita", "16%"],
      ["photoSimilarity", "17%"]
    ]
  },
  {
    id: 6,
    name: "Dipak Lama",
    age: 38,
    genderKey: "male",
    lastSeen: "September 1, 2026",
    location: "Rasuwa, Nepal",
    descriptionKey: "descriptionDipak",
    tags: ["name", "location", "description"],
    match: 71,
    photo: "https://images.unsplash.com/photo-1644293014170-fa2ef378157e?auto=format&fit=crop&w=900&q=85",
    reported: 11,
    verified: false,
    why: [
      ["nameSimilarity", "19%"],
      ["locationRasuwa", "19%"],
      ["descriptionDipak", "17%"],
      ["photoSimilarity", "16%"]
    ]
  },
  {
    id: 7,
    name: "Nirmala Karki",
    age: 46,
    genderKey: "female",
    lastSeen: "September 2, 2026",
    location: "Bhaktapur, Nepal",
    descriptionKey: "descriptionNirmala",
    tags: ["name", "location", "description"],
    match: 68,
    photo: "https://images.unsplash.com/photo-1544735890-a00a690bf27f?auto=format&fit=crop&w=900&q=85",
    reported: 3,
    verified: true,
    why: [
      ["nameSimilarity", "18%"],
      ["locationBhaktapur", "18%"],
      ["descriptionNirmala", "16%"],
      ["photoSimilarity", "16%"]
    ]
  },
  {
    id: 8,
    name: "Bikash Adhikari",
    age: 29,
    genderKey: "male",
    lastSeen: "September 3, 2026",
    location: "Lalitpur, Nepal",
    descriptionKey: "descriptionBikash",
    tags: ["name", "location", "photo"],
    match: 65,
    photo: "https://images.unsplash.com/photo-1763478319571-6a66a49414e1?auto=format&fit=crop&w=900&q=85",
    reported: 4,
    verified: false,
    why: [
      ["nameSimilarity", "17%"],
      ["locationLalitpur", "17%"],
      ["descriptionBikash", "15%"],
      ["photoSimilarity", "16%"]
    ]
  },
  {
    id: 9,
    name: "Sunita Magar",
    age: 36,
    genderKey: "female",
    lastSeen: "September 4, 2026",
    location: "Kaski, Nepal",
    descriptionKey: "descriptionSunita",
    tags: ["name", "location", "clothing", "photo"],
    match: 61,
    photo: "https://images.unsplash.com/photo-1528098650173-f759e216f2dd?auto=format&fit=crop&w=900&q=85",
    reported: 7,
    verified: false,
    why: [
      ["nameSimilarity", "16%"],
      ["locationKaski", "17%"],
      ["descriptionSunita", "14%"],
      ["photoSimilarity", "14%"]
    ]
  },
  {
    id: 10,
    name: "Prakash Gurung",
    age: 55,
    genderKey: "male",
    lastSeen: "September 5, 2026",
    location: "Nuwakot, Nepal",
    descriptionKey: "descriptionPrakash",
    tags: ["name", "location", "description"],
    match: 58,
    photo: "https://images.unsplash.com/photo-1585718540843-11b15b63a18f?auto=format&fit=crop&w=900&q=85",
    reported: 2,
    verified: false,
    why: [
      ["nameSimilarity", "15%"],
      ["locationNuwakot", "16%"],
      ["descriptionPrakash", "13%"],
      ["photoSimilarity", "14%"]
    ]
  },
  {
    id: 11,
    name: "Anita Shahi",
    age: 24,
    genderKey: "female",
    lastSeen: "September 6, 2026",
    location: "Chitwan, Nepal",
    descriptionKey: "descriptionAnita",
    tags: ["name", "location", "description"],
    match: 55,
    photo: "https://images.unsplash.com/photo-1708364171243-c46bc85b2b90?auto=format&fit=crop&w=900&q=85",
    reported: 5,
    verified: false,
    why: [
      ["nameSimilarity", "14%"],
      ["locationChitwan", "15%"],
      ["descriptionAnita", "13%"],
      ["photoSimilarity", "13%"]
    ]
  },
  {
    id: 12,
    name: "Hari Bahadur",
    age: 63,
    genderKey: "male",
    lastSeen: "September 7, 2026",
    location: "Kathmandu, Nepal",
    descriptionKey: "descriptionHari",
    tags: ["name", "location", "clothing"],
    match: 52,
    photo: "https://images.unsplash.com/photo-1769898536685-b21e94b3ffdf?auto=format&fit=crop&w=900&q=85",
    reported: 3,
    verified: false,
    why: [
      ["nameSimilarity", "13%"],
      ["locationKathmandu", "15%"],
      ["descriptionHari", "12%"],
      ["photoSimilarity", "12%"]
    ]
  }
];

const fallbackPhotos = people.map((person) => person.photo);

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function normalizePerson(record, index) {
  const location = record.last_seen_location || "Location not provided";
  return {
    id: record.id,
    name: record.name || "Unnamed person",
    age: record.age ?? "—",
    genderKey: record.gender === "male" ? "male" : record.gender === "female" ? "female" : "unknown",
    lastSeen: formatDate(record.last_seen_date),
    location,
    descriptionText: [record.description, record.clothing].filter(Boolean).join(" ") || "No description provided.",
    tags: ["name", "location", "description"],
    match: null,
    photo: record.photo_url || fallbackPhotos[index % fallbackPhotos.length],
    reported: 0,
    verified: record.status === "found",
    why: [],
    raw: record
  };
}

function levenshteinSimilarity(a, b) {
  const first = (a || "").toLowerCase().trim();
  const second = (b || "").toLowerCase().trim();
  if (!first || !second) return 0;
  if (first === second) return 1;

  const matrix = Array.from({ length: first.length + 1 }, () => new Array(second.length + 1).fill(0));
  for (let i = 0; i <= first.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= second.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= first.length; i += 1) {
    for (let j = 1; j <= second.length; j += 1) {
      const cost = first[i - 1] === second[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const maxLength = Math.max(first.length, second.length);
  return 1 - matrix[first.length][second.length] / maxLength;
}

// Rewards a query that is fully contained in the target (e.g. a city typed
// into a full address) in addition to close full-string matches.
function partialMatchScore(query, target) {
  const q = (query || "").toLowerCase().trim();
  const t = (target || "").toLowerCase().trim();
  if (!q || !t) return 0;
  if (t.includes(q)) return Math.min(1, 0.6 + 0.4 * (q.length / t.length));
  return levenshteinSimilarity(q, t);
}

function ageProximityScore(delta) {
  if (delta === 0) return 1;
  if (delta <= 2) return 0.85;
  if (delta <= 5) return 0.6;
  if (delta <= 10) return 0.3;
  return 0;
}

const SEARCH_MATCH_WEIGHTS = { name: 0.5, age: 0.25, location: 0.25 };

// Scores a person purely against what the visitor actually typed into the
// search form. Any criterion left blank is omitted entirely rather than
// being scored as a match, so e.g. an untyped age never contributes to the
// percentage shown.
function computeSearchMatch(person, { name, age, location } = {}) {
  const factors = {};

  const nameQuery = name?.trim();
  if (nameQuery) {
    factors.name = { score: partialMatchScore(nameQuery, person.name), weight: SEARCH_MATCH_WEIGHTS.name };
  }

  const ageQuery = age === "" || age == null ? null : Number(age);
  if (ageQuery != null && !Number.isNaN(ageQuery) && typeof person.age === "number") {
    factors.age = { score: ageProximityScore(Math.abs(person.age - ageQuery)), weight: SEARCH_MATCH_WEIGHTS.age };
  }

  const locationQuery = location?.trim();
  if (locationQuery) {
    factors.location = { score: partialMatchScore(locationQuery, person.location), weight: SEARCH_MATCH_WEIGHTS.location };
  }

  const entries = Object.entries(factors);
  if (!entries.length) return null;

  const totalWeight = entries.reduce((sum, [, factor]) => sum + factor.weight, 0);
  const score = entries.reduce((sum, [, factor]) => sum + factor.score * (factor.weight / totalWeight), 0);

  return {
    score: Math.round(score * 100),
    factors
  };
}

function App() {
  const [page, setPage] = useState("home");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [reports, setReports] = useState([]);
  const [displayPeople, setDisplayPeople] = useState(people);
  const [locations, setLocations] = useState([]);
  const [recentSightings, setRecentSightings] = useState([]);
  const [apiMessage, setApiMessage] = useState("");
  const [language, setLanguage] = useState(() => localStorage.getItem("reunite-language") || "English");

  useEffect(() => {
    Promise.all([getPeople(), getLocations(), getSightings()])
      .then(async ([peopleResponse, locationResponse, sightingsResponse]) => {
        if (peopleResponse.people?.length) {
          const livePeople = peopleResponse.people.map(normalizePerson);
          const scoredPeople = await Promise.all(livePeople.map(async (person) => {
            try {
              const matchResponse = await getMatches(person.raw.id);
              const topResult = matchResponse.matches?.[0]?.result;
              if (!topResult) return person;

              return {
                ...person,
                match: Math.round(topResult.score * 100),
                why: Object.entries(topResult.factors)
                  .filter(([, factor]) => factor.available)
                  .map(([factor, factorDetail]) => [factor, `${Math.round(factorDetail.score * 100)}%`])
              };
            } catch {
              return person;
            }
          }));
          setDisplayPeople(scoredPeople);
        }
        setLocations(locationResponse.locations || []);
        setRecentSightings((sightingsResponse.sightings || []).slice(0, 6));
      })
      .catch(() => {
        setApiMessage("Showing demo profiles. Start the backend to load live Supabase data.");
      });
  }, []);

  const go = (nextPage) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openPerson = (person) => {
    setSelectedPerson(person);
    setPage("person");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSightingSubmitted = (created) => {
    const sighting = created?.sighting;
    if (sighting) {
      setRecentSightings((prev) => [sighting, ...prev].slice(0, 6));
    }

    const personId = sighting?.person_id;
    if (!personId) return;

    const bumpReported = (candidate) =>
      candidate.raw?.id === personId
        ? { ...candidate, reported: (candidate.reported || 0) + 1 }
        : candidate;

    setSelectedPerson((prev) => (prev ? bumpReported(prev) : prev));
    setDisplayPeople((prev) => prev.map(bumpReported));
  };

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    localStorage.setItem("reunite-language", nextLanguage);
  };

  return (
    <LanguageProvider language={language}>
      <AutoTranslate language={language}>
        <div className="app">
        <Header
          page={page}
          go={go}
          language={language}
          setLanguage={changeLanguage}
        />

        {page === "home" && <Home people={displayPeople} sightings={recentSightings} go={go} openPerson={openPerson} />}
        {apiMessage && <div className="demo-note">{apiMessage}</div>}
        {page === "find" && <FindPerson people={displayPeople} openPerson={openPerson} />}
        {page === "report" && (
          <ReportPage
            onSubmit={async (report) => {
              const created = await createMissingPerson({
                name: report.missingName,
                age: Number.parseInt(report.age, 10) || undefined,
                gender: report.gender.toLowerCase(),
                description: report.description,
                clothing: report.clothing,
                last_seen_date: `${report.date}T${report.time || "12:00"}:00`,
                last_seen_location: report.location
              });
              setReports((old) => [...old, { ...report, id: created.person.id }]);
              const refreshed = await getPeople();
              setDisplayPeople((refreshed.people || []).map(normalizePerson));
              go("reports");
            }}
          />
        )}
        {page === "reports" && <ReportsPage reports={reports} />}
        {page === "person" && selectedPerson && (
          <PersonDetail
            person={selectedPerson}
            locations={locations}
            onSubmitSighting={createSighting}
            onSightingSubmitted={handleSightingSubmitted}
            go={go}
          />
        )}
        {page === "contact" && <Contact />}
        {page === "about" && <About />}

          <Footer go={go} />
        </div>
      </AutoTranslate>
    </LanguageProvider>
  );
}

function Header({ page, go, language, setLanguage }) {
  const { t } = useLanguage();
  const nav = [
    [t("nav.home"), "home"],
    [t("nav.report"), "report"],
    [t("nav.find"), "find"],
    [t("nav.contact"), "contact"]
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={() => go("home")} aria-label={t("nav.homeAria")}>
          <img
  src="/reunite.png"
  alt="Reunite Logo"
  className="brand-symbol"
  style={{ width: "40px", height: "40px" }}
/>

          <span className="brand-word notranslate">Reunite</span>
          <span className="brand-accent notranslate" aria-hidden="true">.</span>
        </button>

        <nav className="nav-left" aria-label={t("nav.main")}>
          {nav.map(([label, value]) => (
            <button
              key={value}
              className={page === value ? "nav-link active" : "nav-link"}
              onClick={() => go(value)}
            >
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <nav className="nav-right" aria-label={t("nav.secondary")}>
          <label className="language-wrap">
            <span className="globe" aria-hidden="true">◎</span>
            <select
              className="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t("nav.language")}
            >
              <option>English</option>
              <option>Español</option>
              <option>Français</option>
            </select>
          </label>
          <button className="about-link" onClick={() => go("about")}>
            {t("nav.about")} <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

function Home({ people: homePeople, sightings, go, openPerson }) {
  const { t } = useLanguage();
  return (
    <main>
      <section className="hero">
        <div className="hero-overlay">
          <div className="hero-content">
            <img
              className="hero-wordmark-image"
              src="/reunite-wordmark-transparent.png"
              alt={t("home.heroAlt")}
            />
            <p>{t("home.tagline")}</p>
            <div className="hero-actions">
              <button className="hero-btn hero-btn-primary" onClick={() => go("find")}>
                <span>{t("home.findButton")}</span><span className="hero-arrow">→</span>
              </button>
              <button className="hero-btn hero-btn-secondary" onClick={() => go("report")}>
                <span>{t("home.reportButton")}</span><span className="hero-arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="context">
        <span className="eyebrow">{t("home.contextEyebrow")}</span>
        <h2>{t("home.contextTitle")}</h2>
        <p>{t("home.contextText1")}</p>
        <p>{t("home.contextText2")}</p>
      </section>

      <section className="section intro">
        <div>
          <span className="eyebrow">{t("home.how")}</span>
          <h2>{t("home.introTitle")}</h2>
          <p>{t("home.introText")}</p>
        </div>

        <div className="steps">
          <Step number="01" title={t("home.step1Title")} text={t("home.step1Text")} />
          <Step number="02" title={t("home.step2Title")} text={t("home.step2Text")} />
          <Step number="03" title={t("home.step3Title")} text={t("home.step3Text")} />
        </div>
      </section>

      <RecentSightings sightings={sightings} />

      <section className="callout">
        <div>
          <span className="eyebrow light">{t("home.helpEyebrow")}</span>
          <h2>{t("home.helpTitle")}</h2>
          <p>{t("home.helpText")}</p>
        </div>
        <button className="white-btn" onClick={() => go("report")}>{t("home.reportButton")}</button>
      </section>
    </main>
  );
}

function RecentSightings({ sightings }) {
  const { t } = useLanguage();

  return (
    <section className="section recent-sightings">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("home.sightingsEyebrow")}</span>
          <h2>{t("home.sightingsTitle")}</h2>
          <p className="section-lede">{t("home.sightingsText")}</p>
        </div>
        <span className="sighting-count">{sightings.length} {t("home.sightingsCount")}</span>
      </div>

      {sightings.length ? (
        <div className="sightings-list">
          {sightings.map((sighting) => (
            <article className="sighting-row" key={sighting.id}>
              <div className="sighting-marker" aria-hidden="true">+</div>
              <div className="sighting-content">
                <div className="sighting-topline">
                  <strong>{sighting.name || t("home.unknownPerson")}</strong>
                  <span className={`status status-${sighting.verification_status || "unverified"}`}>
                    {sighting.verification_status || "unverified"}
                  </span>
                </div>
                <p className="sighting-meta">
                  {sighting.locations?.name || t("home.unknownLocation")}
                  {sighting.sighting_date && ` · ${formatDate(sighting.sighting_date)}`}
                </p>
                <p className="sighting-description">{sighting.description || t("home.noDescription")}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>{t("home.noSightings")}</p></div>
      )}
    </section>
  );
}

function PersonCarousel({ people: carouselPeople, onOpen }) {
  const trackRef = useRef(null);
  const scrollByCards = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const cardWidth = 300;
    track.scrollBy({ left: direction * cardWidth, behavior: "smooth" });

    
  };

  return (
    <div className="carousel-shell">
      <button
        className="carousel-arrow carousel-arrow-left"
        type="button"
        onClick={() => scrollByCards(-1)}
        aria-label="Previous matches"
      >
        ←
      </button>

      <div className="cards-carousel" ref={trackRef}>
        {carouselPeople.map((person) => (
          <div className="carousel-item" key={person.id}>
            <PersonCard person={person} onClick={() => onOpen(person)} />
          </div>
        ))}
      </div>

      <button
        className="carousel-arrow carousel-arrow-right"
        type="button"
        onClick={() => scrollByCards(1)}
        aria-label="Next matches"
      >
        →
      </button>
    </div>
  );
}

function Step({ number, title, text }) {
  return (
    <div className="step">
      <span className="step-number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

function PersonCard({ person, onClick, showMatch = true }) {
  const { t, language } = useLanguage();
  return (
    <article className="person-card" onClick={onClick} tabIndex="0" onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="card-photo-wrap">
        <img src={person.photo} alt={person.name} className="card-photo" />
        {showMatch && (
          <div className="match-badge">
            <strong>{person.match == null ? "—" : `${person.match}%`}</strong>
            <span>{person.match == null ? "Live record" : t("card.match")}</span>
          </div>
        )}
      </div>

      <div className="card-body">
        <h3 className="notranslate">{person.name}</h3>
        <p className="muted">
          {person.age} · {t(`gender.${person.genderKey}`)}
        </p>
        <p><strong>{t("card.lastSeen")}</strong> {person.lastSeen}</p>
        <p><strong>{t("card.location")}</strong> {person.location}</p>
        <div className="tag-row">
          {person.tags.map((tag) => <span key={tag}>{t(`common.${tag}`)}</span>)}
        </div>
        <button className="text-btn">{t("card.details")}</button>
      </div>
    </article>
  );
}

function FindPerson({ people: availablePeople, openPerson }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [sort, setSort] = useState("match");
  const hasSearch = Boolean(name.trim() || age || location.trim());

  const results = useMemo(() => {
    if (!hasSearch) return [];

    let filtered = availablePeople.filter((person) => {
      const nameOk = person.name.toLowerCase().includes(name.toLowerCase());
      const ageOk = !age || Math.abs(person.age - Number(age)) <= 5;
      const locationOk = !location || person.location.toLowerCase().includes(location.toLowerCase());
      return nameOk && ageOk && locationOk;
    });

    filtered = filtered.map((person) => ({
      ...person,
      searchMatch: computeSearchMatch(person, { name, age, location })
    }));

    if (sort === "match") filtered.sort((a, b) => (b.searchMatch?.score ?? 0) - (a.searchMatch?.score ?? 0));
    if (sort === "age") filtered.sort((a, b) => a.age - b.age);
    if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  }, [availablePeople, name, age, hasSearch, location, sort]);

  return (
    <main className="page">
      <div className="page-header">
        <span className="eyebrow">{t("search.eyebrow")}</span>
        <h1>{t("search.title")}</h1>
        <p>{t("search.subtitle")}</p>
      </div>

      <section className="search-panel">
        <div className="field">
          <label>{t("search.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("search.namePlaceholder")} />
        </div>
        <div className="field">
          <label>{t("search.age")}</label>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder={t("search.agePlaceholder")} />
        </div>
        <div className="field">
          <label>{t("search.location")}</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("search.locationPlaceholder")} />
        </div>
        <div className="field">
          <label>{t("search.sort")}</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="match">{t("search.highestMatch")}</option>
            <option value="age">{t("search.ageOption")}</option>
            <option value="name">{t("search.nameOption")}</option>
          </select>
        </div>
      </section>

      <div className="results-title">
        <div>
          <h2>{t("search.results")}</h2>
          <p>
            {!hasSearch
              ? t("search.startSearching")
              : results.length === 1
              ? t("search.oneMatch")
              : t("search.manyMatches", { count: results.length })}
          </p>
        </div>
      </div>

     {results.length ? (
  <div className="carousel-shell">
    <button
      className="carousel-arrow carousel-arrow-left"
      type="button"
      onClick={() => {
        const track = document.querySelector(".search-results-carousel");
        if (track) {
          track.scrollBy({
            left: -Math.max(track.clientWidth * 0.85, 320),
            behavior: "smooth",
          });
        }
      }}
      aria-label="Previous search results"
    >
      ←
    </button>

    <div className="cards-carousel search-results-carousel">
      {results.map((person) => (
        <div className="carousel-item" key={person.id}>
          <PersonCard
            person={person}
            showMatch={false}
            onClick={() => openPerson(person)}
          />
        </div>
      ))}
    </div>

    <button
      className="carousel-arrow carousel-arrow-right"
      type="button"
      onClick={() => {
        const track = document.querySelector(".search-results-carousel");
        if (track) {
          track.scrollBy({
            left: Math.max(track.clientWidth * 0.85, 320),
            behavior: "smooth",
          });
        }
      }}
      aria-label="Next search results"
    >
      →
    </button>
  </div>
) : (
  <div className="empty-state">
    <div className="empty-icon">⌕</div>
    <h3>{t("search.noReports")}</h3>
    <p>{hasSearch ? t("search.tryAgain") : t("search.startSearching")}</p>
  </div>
)}
    </main>
  );
}

function PersonDetail({ person, locations, onSubmitSighting, onSightingSubmitted, go }) {
  const { t } = useLanguage();
  const [showSighting, setShowSighting] = useState(false);
  const [sent, setSent] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [matchError, setMatchError] = useState("");
  const [sightingLocation, setSightingLocation] = useState("");
  const [sightingDate, setSightingDate] = useState("");
  const [sightingDescription, setSightingDescription] = useState("");
  const [sightingError, setSightingError] = useState("");
  const [submittingSighting, setSubmittingSighting] = useState(false);

  const hasSearchMatch = Boolean(person.searchMatch);

  const loadMatchResult = useCallback(async () => {
    const personId = person.raw?.id;
    if (!personId || hasSearchMatch) return;

    setMatchError("");
    try {
      const payload = await getMatches(personId);
      setMatchResult(payload.matches?.[0]?.result || null);
    } catch (error) {
      setMatchError(error.message);
    }
  }, [person.raw?.id, hasSearchMatch]);

  useEffect(() => {
    setMatchResult(null);
    loadMatchResult();
  }, [loadMatchResult]);

  const factorLabel = (factor) => {
    if (factor === "age") return t("search.ageOption");
    return t(`common.${factor}`);
  };

  const displayedScore = hasSearchMatch
    ? person.searchMatch.score
    : matchResult
    ? Math.round(matchResult.score * 100)
    : person.match;

  const displayedReasons = hasSearchMatch
    ? Object.entries(person.searchMatch.factors).map(([factor, detail]) => ({
        label: factorLabel(factor),
        score: `${Math.round(detail.score * 100)}%`,
        reason: ""
      }))
    : matchResult
    ? Object.entries(matchResult.factors)
        .filter(([, detail]) => detail.available)
        .map(([factor, detail]) => ({
          label: factorLabel(factor),
          score: `${Math.round(detail.score * 100)}%`,
          reason: detail.reason
        }))
    : person.why.map(([reasonKey, percent]) => ({
        label: factorLabel(reasonKey),
        score: percent,
        reason: ""
      }));

  const submitSighting = async () => {
    if (!sightingLocation || !sightingDate) {
      setSightingError("Choose a location and date before submitting.");
      return;
    }

    setSubmittingSighting(true);
    setSightingError("");
    try {
      const created = await onSubmitSighting({
        person_id: person.id,
        location_id: sightingLocation,
        sighting_date: new Date(sightingDate).toISOString(),
        description: sightingDescription,
        name: person.name,
        age: typeof person.age === "number" ? person.age : undefined
      });
      setSent(true);
      onSightingSubmitted?.(created);
      loadMatchResult();
    } catch (error) {
      setSightingError(error.message);
    } finally {
      setSubmittingSighting(false);
    }
  };

  return (
    <main className="page">
      <button className="back-btn" onClick={() => go("find")}>{t("person.back")}</button>

      <div className="detail-layout">
        <section className="detail-card">
          <img src={person.photo} alt={person.name} className="detail-photo" />
          <div className="detail-main">
            <div className="detail-title-row">
              <div>
                <h1 className="notranslate">{person.name}</h1>
                <p>{person.age} · {t(`gender.${person.genderKey}`)}</p>
              </div>
              <div className="large-match">
                <strong>{displayedScore == null ? "—" : `${displayedScore}%`}</strong>
                <span>{matchResult?.label || (displayedScore == null ? "No score yet" : t("card.match"))}</span>
              </div>
            </div>

            <div className="detail-section">
              <h3>{t("person.why")}</h3>
              {displayedReasons.map(({ label, score, reason }) => (
                <div className="reason" key={label} title={reason}>
                  <span className="reason-dot">✓</span>
                  <span>{label}</span>
                  <strong>{score}</strong>
                </div>
              ))}
              {matchError && <p className="form-error">Unable to load live match details: {matchError}</p>}
            </div>

            <div className="detail-section">
              <h3>{t("person.details")}</h3>
              <div className="detail-row"><span>{t("person.lastSeen")}</span><strong>{person.lastSeen}</strong></div>
              <div className="detail-row"><span>{t("person.location")}</span><strong>{person.location}</strong></div>
              <div className="detail-row"><span>{t("person.description")}</span><strong>{person.descriptionText || t(`common.${person.descriptionKey}`)}</strong></div>
            </div>

            <div className="verification">
              <span>✓</span>
              <div>
                <strong>{person.verified ? t("person.verifying") : t("person.reviewing")}</strong>
                <p>{t("person.reported", { count: person.reported })}</p>
              </div>
            </div>

            <button className="primary-btn full" onClick={() => setShowSighting(true)}>
              {t("person.reportSighting")}
            </button>
          </div>
        </section>
      </div>

      {showSighting && (
        <div className="modal-backdrop" onClick={() => setShowSighting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {!sent ? (
              <>
                <button className="modal-close" onClick={() => setShowSighting(false)}>×</button>
                <h2>{t("person.sightingTitle")}</h2>
                <p>{t("person.sightingText", { name: person.name })}</p>
                <div className="field">
                  <label>{t("person.where")}</label>
                  <select value={sightingLocation} onChange={(e) => setSightingLocation(e.target.value)}>
                    <option value="">Choose a location</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name || location.address}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>{t("person.when")}</label>
                  <input type="datetime-local" value={sightingDate} onChange={(e) => setSightingDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t("person.additional")}</label>
                  <textarea rows="4" value={sightingDescription} onChange={(e) => setSightingDescription(e.target.value)} placeholder={t("person.additionalPlaceholder")} />
                </div>
                {sightingError && <div className="form-error">{sightingError}</div>}
                <button className="primary-btn full" onClick={submitSighting} disabled={submittingSighting}>
                  {submittingSighting ? "Submitting..." : t("person.submit")}
                </button>
              </>
            ) : (
              <div className="success">
                <div className="success-icon">✓</div>
                <h2>{t("person.thankYou")}</h2>
                <p>{t("person.submitted")}</p>
                <button className="primary-btn" onClick={() => setShowSighting(false)}>{t("person.close")}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function ReportPage({ onSubmit }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    reporterName: "",
    reporterPhone: "",
    missingName: "",
    age: "",
    gender: "",
    location: "",
    date: "",
    time: "",
    description: "",
    clothing: "",
    photo: null
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.reporterName || !form.reporterPhone || !form.missingName || !form.location || !form.date) {
      setError(t("report.requiredError"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({ ...form, submittedAt: new Date().toLocaleString() });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <span className="eyebrow">{t("report.eyebrow")}</span>
        <h1>{t("report.title")}</h1>
        <p>{t("report.subtitle")}</p>
      </div>

      <form className="report-form" onSubmit={submit}>
        <section className="form-section">
          <h2>{t("report.reporterInfo")}</h2>
          <div className="form-grid">
            <Field label={t("report.yourName")} value={form.reporterName} onChange={(v) => update("reporterName", v)} />
            <Field label={t("report.phone")} value={form.reporterPhone} onChange={(v) => update("reporterPhone", v)} />
          </div>
        </section>

        <section className="form-section">
          <h2>{t("report.missingInfo")}</h2>
          <div className="form-grid">
            <Field label={t("report.fullName")} value={form.missingName} onChange={(v) => update("missingName", v)} />
            <Field label={t("report.ageRange")} value={form.age} onChange={(v) => update("age", v)} placeholder={t("report.agePlaceholder")} />
            <div className="field">
              <label>{t("report.gender")}</label>
              <select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option value="">{t("report.select")}</option>
                <option>{t("report.female")}</option>
                <option>{t("report.male")}</option>
                <option>{t("report.nonBinary")}</option>
                <option>{t("report.unknown")}</option>
              </select>
            </div>
            <Field label={t("report.lastLocation")} value={form.location} onChange={(v) => update("location", v)} />
            <Field label={t("report.dateLastSeen")} type="date" value={form.date} onChange={(v) => update("date", v)} />
            <Field label={t("report.timeLastSeen")} type="time" value={form.time} onChange={(v) => update("time", v)} />
          </div>
        </section>

        <section className="form-section">
          <h2>{t("report.description")}</h2>
          <div className="form-grid">
            <div className="field full-field">
              <label>{t("report.description")}</label>
              <textarea rows="4" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder={t("report.descriptionPlaceholder")} />
            </div>
            <div className="field full-field">
              <label>{t("report.clothing")}</label>
              <textarea rows="3" value={form.clothing} onChange={(e) => update("clothing", e.target.value)} placeholder={t("report.clothingPlaceholder")} />
            </div>
            <div className="field full-field">
              <label>{t("report.photo")}</label>
              <input type="file" accept="image/*" onChange={(e) => update("photo", e.target.files?.[0] || null)} />
              <small>{t("report.photoHelp")}</small>
            </div>
          </div>
        </section>

        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : t("report.submitReport")}
        </button>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ReportsPage({ reports }) {
  const { t } = useLanguage();
  return (
    <main className="page">
      <div className="page-header">
        <span className="eyebrow">{t("reports.eyebrow")}</span>
        <h1>{t("reports.title")}</h1>
        <p>{t("reports.subtitle")}</p>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">▣</div>
          <h3>{t("reports.none")}</h3>
          <p>{t("reports.noneText")}</p>
        </div>
      ) : (
        <div className="submitted-list">
          {reports.map((report, index) => (
            <div className="submitted-card" key={index}>
              <div>
                <span className="status">{t("reports.submitted")}</span>
                <h2 className="notranslate">{report.missingName}</h2>
                <p>{t("reports.lastKnown")} {report.location}</p>
                <p>{t("reports.lastSeen")} {report.date} {report.time}</p>
              </div>
              <span className="muted">{report.submittedAt}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Contact() {
  const { t } = useLanguage();
  return (
    <main className="page narrow">
      <div className="page-header">
        <span className="eyebrow">{t("contact.eyebrow")}</span>
        <h1>{t("contact.title")}</h1>
        <p>{t("contact.subtitle")}</p>
      </div>
      <div className="contact-card">
        <h2>{t("contact.support")}</h2>
        <p>{t("contact.email")} support@reunite.com</p>
        <p>{t("contact.phone")} (555) 010-2025</p>
        <p className="notice">{t("contact.notice")}</p>
      </div>
    </main>
  );
}

function About() {
  const { t } = useLanguage();
  return (
    <main className="page narrow">
      <div className="page-header">
        <span className="eyebrow">{t("about.eyebrow")}</span>
        <h1>{t("about.title")}</h1>
        <p>{t("about.subtitle")}</p>
      </div>
      <div className="context">
        <h2>{t("home.contextTitle")}</h2>
        <p>{t("home.contextText1")}</p>
        <p>{t("home.contextText2")}</p>
      </div>
      <div className="about-grid">
        <div className="info-card"><h3>{t("about.searchTitle")}</h3><p>{t("about.searchText")}</p></div>
        <div className="info-card"><h3>{t("about.reportsTitle")}</h3><p>{t("about.reportsText")}</p></div>
        <div className="info-card"><h3>{t("about.communityTitle")}</h3><p>{t("about.communityText")}</p></div>
      </div>
    </main>
  );
}

function Footer({ go }) {
  const { t } = useLanguage();
  return (
    <footer className="footer">
      <div>
        <div className="footer-brand"><img
  src="/reunite.png"
  alt="Reunite Logo"
  className="brand-symbol"
  style={{ width: "40px", height: "40px" }}
/>
</div>
        <p>{t("footer.tagline")}</p>
      </div>
      <div className="footer-links">
        <button onClick={() => go("about")}>{t("nav.about")}</button>
        <button onClick={() => go("contact")}>{t("nav.contact")}</button>
        <button onClick={() => go("report")}>{t("nav.report")}</button>
        <button onClick={() => go("find")}>{t("nav.find")}</button>
      </div>
      <p className="copyright">{t("footer.copyright")}</p>
    </footer>
  );
}

export default App;
