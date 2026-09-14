import { test, expect } from 'bun:test'
import { extractVideoURL, responseTaskId, statusText, videoContentURL } from '../web/default/src/features/video-workbench/video-response.ts'

test('completed OpenAI response renders its video', () => {
 const response = {id:'task_123', status:'completed', metadata:{url:'https://media.example/video.mp4'}}
 expect(responseTaskId(response)).toBe('task_123')
 expect(statusText(response)).toBe('completed')
 expect(extractVideoURL(response)).toBe('https://media.example/video.mp4')
})
test('nested APIMart status and URL arrays', () => {
 const response = {data:{id:'task_nested',status:'succeeded',result:{videos:[{url:['https://media.example/video.mp4']}]}}}
 expect(responseTaskId(response)).toBe('task_nested')
 expect(statusText(response)).toBe('completed')
 expect(extractVideoURL(response)).toBe('https://media.example/video.mp4')
 expect(statusText({data:[{status:'failure'}]})).toBe('failed')
})
test('authenticated same-origin download and malformed results', () => {
 expect(videoContentURL('task/one', true)).toBe('/v1/videos/task%2Fone/content?download=1')
 expect(extractVideoURL({data:{result:{videos:[null]}}})).toBe('')
 expect(statusText(null)).toBe('queued')
})
