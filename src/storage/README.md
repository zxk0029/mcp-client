# 文件系统存储 (`FileSystemStorage`)

本模块提供了 `StorageHandler` 接口的一个具体实现，用于将数据保存到本地文件系统。

## 目的

`FileSystemStorage` 类旨在提供一个统一、通用的接口来处理文件保存、读取以及相关的元数据管理。它将所有输出文件集中在配置的基础路径下（默认为项目根目录下的 `outputs` 文件夹），并维护一个中央元数据索引文件 (`outputs/metadata-index.json`)，以支持基于标签的查找和元数据检索。

## 使用默认实例

为了方便使用，模块导出了一个默认的 `FileSystemStorage` 实例 `defaultStorage`。大多数情况下，您只需要导入并使用这个实例即可：

```typescript
import { defaultStorage } from './storage/index.js'; // 或相对路径

// ... later in your code
await defaultStorage.save('some_subdir/my_data.json', { key: 'value' }, { tags: ['my_tag'] });
const content = await defaultStorage.read('some_subdir/my_data.json', true);
const taggedFiles = defaultStorage.findByTags(['my_tag']);
```

## 主要方法说明

### `async save(filename: string, content: any, options?: StorageOptions): Promise<string>`

保存内容到文件系统。

*   `filename` (string): **必需**。要保存的文件名，**应包含相对于基础路径 (`outputs`) 的子目录**。例如：`'transcripts/video123.txt'` 或 `'crawler_results/data.json'`。如果指定的子目录不存在，`save` 方法会自动创建它们。
*   `content` (any): **必需**。要保存的内容。可以是字符串、Buffer 或任何可被 `JSON.stringify` 序列化的对象。对象会被格式化为带缩进的 JSON 字符串后保存。
*   `options` (StorageOptions, 可选): 包含额外设置：
    *   `tags` (string[], 可选): 一个字符串数组，用于给文件打标签。这些标签会被记录在元数据索引中，用于后续的 `findByTags` 查询。
    *   `metadata` (Record<string, any>, 可选): 一个包含任意键值对的对象，用于存储与文件相关的元数据（例如：来源 URL、处理时间、标题等）。这些元数据也会被记录在索引中，可通过 `getMetadata` 获取。
    *   `overwrite` (boolean, 可选): 默认为 `true`。如果设为 `false`，当文件已存在时，`save` 操作会直接返回现有路径而不覆盖文件。
*   **返回值**: (Promise<string>) 保存文件的**绝对**路径。

### `async read(filename: string, parseJson: boolean = false): Promise<any>`

读取文件内容。

*   `filename` (string): **必需**。要读取的文件名，包含相对于基础路径的子目录。
*   `parseJson` (boolean, 可选): 默认为 `false`。如果设为 `true`，会尝试将读取到的内容解析为 JSON 对象。如果解析失败，会发出警告并返回原始字符串。
*   **返回值**: (Promise<any>) 文件内容（字符串或解析后的对象）。

### `findByTags(tags: string[]): string[]`

根据标签查找文件。

*   `tags` (string[]): **必需**。一个包含要匹配的标签的数组。只有**同时包含所有**指定标签的文件才会被返回。
*   **返回值**: (string[]) 包含所有匹配文件**绝对**路径的数组。

### `getMetadata(filename: string): Record<string, any> | undefined`

获取指定文件的元数据。

*   `filename` (string): **必需**。要获取元数据的文件名，包含相对于基础路径的子目录。
*   **返回值**: (Record<string, any> | undefined) 包含文件元数据（包括保存时提供的 `metadata`、`tags` 以及时间戳）的对象，如果文件没有元数据记录则返回 `undefined`。

### `getStoragePath(): string`

获取基础存储目录的绝对路径。

*   **返回值**: (string) 例如 `/path/to/your/project/outputs`。

### `getSubdirectoryPath(subdir: string): string`

获取指定子目录的绝对路径。

*   `subdir` (string): **必需**。子目录的名称（例如 `'summaries'`）。
*   **返回值**: (string) 例如 `/path/to/your/project/outputs/summaries`。

## 目录结构与元数据索引

*   **基础目录**: 默认情况下，所有文件都保存在项目根目录下的 `outputs` 文件夹中。
*   **子目录**: 您可以通过在 `save` 方法的 `filename` 参数中指定路径来创建任意层级的子目录（例如 `'level1/level2/my_file.txt'`）。
*   **`metadata-index.json`**: 此文件位于 `outputs` 目录下，用于存储所有通过 `save` 方法保存的文件的元数据和标签信息。`FileSystemStorage` 在初始化时加载此文件，并在每次成功调用 `save`（且提供了 `metadata` 或 `tags`）后更新此文件。`findByTags` 和 `getMetadata` 方法都依赖于此索引文件。 