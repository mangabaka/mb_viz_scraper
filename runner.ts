import { all_series_page_parse, parse_series_page, parse_book_page } from './viz.js'
import { string_to_date } from './date.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { writeFile } from 'fs/promises'

async function saveJsonToFileAsync(data: any, path: string) {
  try {
    const jsonString = JSON.stringify(data, null, 2);

    await writeFile(path, jsonString, 'utf8');
    console.log(`JSON data successfully saved to ${path} (async).`);
  } catch (error) {
    console.error(`Error saving JSON data to ${path} (async):`, error);
  }
}

export async function http_request(url: string = ''): Promise<cheerio.CheerioAPI> {
    try {
        const response = await axios.get(url, {
            maxRedirects: 1,
        })

        if (response.status !== 200) {
            throw new Error(`Failed to retrieve the web page - got response code [${response.status}] for URL [${url}]`)
        }

        console.log('Successfully fetched URL. Loading with Cheerio...')
        return cheerio.load(response.data)
    } catch (error: any) {
        console.error('An error occurred during parsing:')
        if (error.response) {
            console.error(`Status: ${error.response.status}`)
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`)
        } else if (error instanceof Error) {
            console.error(`Error: ${error.message}`)
        } else {
            console.error(error)
        }
        process.exit(1)
    }
    
}

// Get the URL from command line arguments
const cmd = process.argv[2]
const url = process.argv[3]

if (cmd == 'book') {
    const book_details = await parse_book_page(url)
    const slug = url.replace('https://www.viz.com/manga-books/', '').replaceAll('/', '-')
    const file_path = './data/book_' + slug + '.json'
    saveJsonToFileAsync(book_details, file_path)   
} else if (cmd == 'all_series') {
    const all_series = await all_series_page_parse()
    const file_path = './data/all_series_' + Date.now().toString() + '.json'
    saveJsonToFileAsync(all_series, file_path)
} else if (cmd == 'series') {
    const series_details = await parse_series_page(url)
    const slug = url.replace('https://www.viz.com/', '').replace('/', '')
    const file_path = './data/series_' + slug + '.json'
    saveJsonToFileAsync(series_details, file_path)    
}
