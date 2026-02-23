#!/bin/bash
# 📓 業務日誌データベースをNotionページに作成するスクリプト
#
# 使い方:
#   chmod +x scripts/create-notion-database.sh
#   ./scripts/create-notion-database.sh
#
# 必要: curl, bash

NOTION_API_TOKEN="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"
PAGE_ID="310e5ac7063980a2be0ecc4901ffefb7"

curl -s -X POST 'https://api.notion.com/v1/databases' \
  -H "Authorization: Bearer ${NOTION_API_TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'Notion-Version: 2022-06-28' \
  -d '{
    "parent": {
      "type": "page_id",
      "page_id": "'"${PAGE_ID}"'"
    },
    "title": [
      {
        "type": "text",
        "text": {
          "content": "📓 業務日誌"
        }
      }
    ],
    "properties": {
      "日付": {
        "date": {}
      },
      "担当": {
        "select": {
          "options": [
            {
              "name": "杉本",
              "color": "blue"
            },
            {
              "name": "片岡",
              "color": "green"
            }
          ]
        }
      },
      "今日やったこと": {
        "rich_text": {}
      },
      "明日やること": {
        "rich_text": {}
      },
      "片岡の一言": {
        "rich_text": {}
      },
      "杉本→片岡フィードバック": {
        "rich_text": {}
      },
      "杉本の確信メモ": {
        "rich_text": {}
      },
      "片岡のやり切りメモ": {
        "rich_text": {}
      },
      "週間目標": {
        "rich_text": {}
      },
      "月間目標": {
        "rich_text": {}
      }
    }
  }'

echo ""
echo "---"
echo "データベース作成リクエストが完了しました。"
echo "上記のレスポンスに 'id' が含まれていれば成功です。"
