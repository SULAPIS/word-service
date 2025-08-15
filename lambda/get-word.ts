import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

interface SectionsResponse {
  parse: {
    sections: Array<{
      line: string;
      index: string;
    }>;
  };
}
interface PronunciationResponse {
  query: {
    pages: {
      [key: string]: {
        revisions: Array<{
          slots: {
            main: {
              "*": string;
            };
          };
        }>;
      };
    };
  };
}
interface AudioResponse {
  query: {
    pages: {
      [key: string]: {
        imageinfo: Array<{
          url: string;
        }>;
      };
    };
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const word = event.pathParameters?.word;
  if (!word) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Word parameter is required",
      }),
    };
  }

  try {
    const sections = await fetch(
      `https://en.wiktionary.org/w/api.php?action=parse&page=${word}&prop=sections&format=json`
    );
    if (!sections.ok) {
      return {
        statusCode: sections.status,
        body: JSON.stringify({
          message: await sections.text(),
        }),
      };
    }

    const sectionsData = (await sections.json()) as SectionsResponse;
    const pronunciationSectionIndex = sectionsData.parse.sections.find(
      (section) => section.line === "Pronunciation"
    )?.index;

    const pronunciation = await fetch(
      `https://en.wiktionary.org/w/api.php?action=query&format=json&titles=${word}&prop=revisions&rvprop=content&rvslots=*&rvsection=${pronunciationSectionIndex}`
    );
    if (!pronunciation.ok) {
      return {
        statusCode: pronunciation.status,
        body: JSON.stringify({
          message: await pronunciation.text(),
        }),
      };
    }
    const pronunciationData =
      (await pronunciation.json()) as PronunciationResponse;
    // {{IPA|en|/pəˈteɪtəʊz/|a=RP}}
    // {{IPA|en|/tɹiː/|[t̠ʰɹʷiː]|[t͡ʃʰɹʷiː]|[t̠͡ɹ̠̊˔ʷiː]|}}
    // {{IPA|en|/kənˈtɛnt/}}
    // {{IPA|en|/ˈlæpɪs/}}
    // {{IPA|en|/ˈkʊki/}}
    const ipaMatch = pronunciationData.query.pages[
      Object.keys(pronunciationData.query.pages)[0]
    ].revisions[0].slots.main["*"].match(/\{\{IPA\|en\|(\/[^/]+\/)/);
    const ipa = ipaMatch ? ipaMatch[1] : undefined;

    // {{audio|en|LL-Q1860 (eng)-Vealhurl-content (verb).wav|a=Southern England}}
    // {{audio|en|en-us-setting.ogg|a=US}}
    // {{audio|en|en-uk-body.ogg}}
    const audioMatch = pronunciationData.query.pages[
      Object.keys(pronunciationData.query.pages)[0]
    ].revisions[0].slots.main["*"].match(/\{\{audio\|en\|([^|}]+)/);
    const audio = audioMatch ? audioMatch[1] : null;

    let audioUrl: string | undefined = undefined;
    if (audio) {
      const audioData = await fetch(
        `https://en.wiktionary.org/w/api.php?action=query&format=json&titles=File:${audio}&prop=imageinfo&iiprop=url
        `
      );
      if (!audioData.ok) {
        return {
          statusCode: audioData.status,
          body: JSON.stringify({
            message: await audioData.text(),
          }),
        };
      }
      const audioResponse = (await audioData.json()) as AudioResponse;
      audioUrl =
        audioResponse.query.pages[Object.keys(audioResponse.query.pages)[0]]
          .imageinfo[0].url;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ipa,
        audio_url: audioUrl,
      }),
    };
  } catch (error) {
    console.error(`Error fetching sections for word ${word}:`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Error fetching data for word ${word}`,
      }),
    };
  }
};
