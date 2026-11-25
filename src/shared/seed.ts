import type { DataSet } from './types'

export function seedData(): DataSet {
  return {
    purchases: [
      {
        id: 'p-1',
        date: '2026-11-01',
        title: 'Партия №1',
        items: [
          { color: 'Тёмно-синий', qty: 2, unitCny: 100 },
          { color: 'Бежевый', qty: 3, unitCny: 100 },
          { color: 'Чёрный', qty: 3, unitCny: 100 },
          { color: 'Коричневый', qty: 2, unitCny: 100 }
        ],
        costs: [
          { label: 'Товар 1000 ¥ + доставка до карго 16 ¥', kzt: 73975.08 },
          { label: 'Карго в Казахстан', kzt: 5350 },
          { label: 'Пакеты Jacquemus 10 шт', kzt: 7201 },
          { label: 'Доставка пакетов из Китая', kzt: 2822 }
        ]
      }
    ],
    sales: [],
    expenses: [],
    config: { targetPrice: 20000, minPrice: 17000 }
  }
}
