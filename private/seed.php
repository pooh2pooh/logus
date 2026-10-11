<?php
declare(strict_types=1);

/*
 * Демонстрационный набор заказов для mock-адаптеров площадок.
 * Реальные коннекторы заменят эти данные, сохранив канонический контракт.
 * Файл лежит в private/ (закрыт .htaccess), не является секретом, но и не
 * должен раздаваться как статика.
 *
 * Ключи строки заказа:
 *   sourceOrderId, fromCity, fromAddress, toCity, toAddress,
 *   cargo, weightKg, volumeM3, places, bodyType,
 *   price, vat, carrierName, carrierContact, carrierRating,
 *   status, createdDaysAgo, loadInDays, transitHours,
 *   deviation? {kind, reason, minutes}, problemReason?
 */

final class Seed
{
    /** @return array<int, array<string, mixed>> */
    public static function orders(string $platform): array
    {
        $all = self::data();
        return $all[$platform] ?? [];
    }

    /** @return array<string, array<int, array<string, mixed>>> */
    private static function data(): array
    {
        return [
            'ati' => [
                [
                    'sourceOrderId' => '10231', 'fromCity' => 'Москва', 'fromAddress' => 'Ленинградское ш., 63',
                    'toCity' => 'Санкт-Петербург', 'toAddress' => 'Пулковское ш., 40',
                    'cargo' => 'Бытовая техника', 'weightKg' => 18400, 'volumeM3' => 82.5, 'places' => 132,
                    'bodyType' => 'тент', 'price' => 92000, 'vat' => 'with',
                    'carrierName' => 'ТрансЛайн', 'carrierContact' => '+7 495 120-33-11', 'carrierRating' => 4.8,
                    'status' => 'in_transit', 'createdDaysAgo' => 3, 'loadInDays' => -1, 'transitHours' => 22,
                ],
                [
                    'sourceOrderId' => '10244', 'fromCity' => 'Екатеринбург', 'fromAddress' => 'ул. Черняховского, 86',
                    'toCity' => 'Казань', 'toAddress' => 'пр. Победы, 226',
                    'cargo' => 'Автозапчасти', 'weightKg' => 9600, 'volumeM3' => 48.0, 'places' => 64,
                    'bodyType' => 'фура', 'price' => 71000, 'vat' => 'with',
                    'carrierName' => 'Магистраль', 'carrierContact' => '+7 343 210-77-02', 'carrierRating' => 4.5,
                    'status' => 'loading', 'createdDaysAgo' => 2, 'loadInDays' => 0, 'transitHours' => 16,
                ],
                [
                    'sourceOrderId' => '10250', 'fromCity' => 'Новосибирск', 'fromAddress' => 'ул. Станционная, 60',
                    'toCity' => 'Красноярск', 'toAddress' => 'ул. Телевизорная, 1',
                    'cargo' => 'Стройматериалы', 'weightKg' => 21000, 'volumeM3' => 92.0, 'places' => 18,
                    'bodyType' => 'борт', 'price' => 58000, 'vat' => 'without',
                    'carrierName' => 'СеверТранс', 'carrierContact' => '+7 383 300-12-45', 'carrierRating' => 4.2,
                    'status' => 'problem', 'createdDaysAgo' => 4, 'loadInDays' => -2, 'transitHours' => 20,
                    'problemReason' => 'Перевозчик сообщил о поломке: требуется решение клиента',
                    'deviation' => ['kind' => 'delay', 'reason' => 'Задержка выезда из-за поломки', 'minutes' => 300],
                ],
                [
                    'sourceOrderId' => '10261', 'fromCity' => 'Ростов-на-Дону', 'fromAddress' => 'ул. Доватора, 148',
                    'toCity' => 'Воронеж', 'toAddress' => 'Московский пр., 142',
                    'cargo' => 'Продукты питания', 'weightKg' => 15600, 'volumeM3' => 60.0, 'places' => 900,
                    'bodyType' => 'реф', 'price' => 64000, 'vat' => 'with',
                    'carrierName' => 'ХолодЛогистик', 'carrierContact' => '+7 863 250-88-19', 'carrierRating' => 4.9,
                    'status' => 'delivered', 'createdDaysAgo' => 6, 'loadInDays' => -5, 'transitHours' => 12,
                ],
                [
                    'sourceOrderId' => '10270', 'fromCity' => 'Самара', 'fromAddress' => 'Заводское ш., 14',
                    'toCity' => 'Уфа', 'toAddress' => 'ул. Маршала Жукова, 5',
                    'cargo' => 'Мебель', 'weightKg' => 7200, 'volumeM3' => 70.0, 'places' => 210,
                    'bodyType' => 'тент', 'price' => 47000, 'vat' => 'with',
                    'carrierName' => 'ГрузАвто', 'carrierContact' => '+7 846 210-40-30', 'carrierRating' => 4.0,
                    'status' => 'carrier_assigned', 'createdDaysAgo' => 1, 'loadInDays' => 2, 'transitHours' => 10,
                ],
                [
                    'sourceOrderId' => '10277', 'fromCity' => 'Челябинск', 'fromAddress' => 'Троицкий тракт, 11',
                    'toCity' => 'Пермь', 'toAddress' => 'ул. Героев Хасана, 105',
                    'cargo' => 'Металлопрокат', 'weightKg' => 22000, 'volumeM3' => 44.0, 'places' => 12,
                    'bodyType' => 'борт', 'price' => 53000, 'vat' => 'without',
                    'carrierName' => 'УралТрак', 'carrierContact' => '+7 351 700-15-15', 'carrierRating' => 4.4,
                    'status' => 'confirmed', 'createdDaysAgo' => 2, 'loadInDays' => 1, 'transitHours' => 11,
                ],
                [
                    'sourceOrderId' => '10283', 'fromCity' => 'Москва', 'fromAddress' => 'Дмитровское ш., 100',
                    'toCity' => 'Нижний Новгород', 'toAddress' => 'Московское ш., 300',
                    'cargo' => 'Электроника', 'weightKg' => 5400, 'volumeM3' => 38.0, 'places' => 240,
                    'bodyType' => 'изотерм', 'price' => 39000, 'vat' => 'with',
                    'carrierName' => 'ЭкспрессПро', 'carrierContact' => '+7 495 900-22-88', 'carrierRating' => 4.7,
                    'status' => 'closed', 'createdDaysAgo' => 9, 'loadInDays' => -8, 'transitHours' => 9,
                ],
                [
                    'sourceOrderId' => '10290', 'fromCity' => 'Краснодар', 'fromAddress' => 'ул. Тополиная, 30',
                    'toCity' => 'Сочи', 'toAddress' => 'ул. Гагарина, 15',
                    'cargo' => 'Одежда', 'weightKg' => 3100, 'volumeM3' => 42.0, 'places' => 180,
                    'bodyType' => 'фура', 'price' => 28000, 'vat' => 'with',
                    'carrierName' => 'ГрузАвто', 'carrierContact' => '+7 861 200-10-10', 'carrierRating' => 4.1,
                    'status' => 'created', 'createdDaysAgo' => 0, 'loadInDays' => 3, 'transitHours' => 7,
                ],
            ],
            'loginet' => [
                [
                    'sourceOrderId' => 'LG-5501', 'fromCity' => 'Санкт-Петербург', 'fromAddress' => 'Софийская ул., 91',
                    'toCity' => 'Тверь', 'toAddress' => 'Московское ш., 12',
                    'cargo' => 'Медикаменты', 'weightKg' => 4200, 'volumeM3' => 28.0, 'places' => 96,
                    'bodyType' => 'реф', 'price' => 34000, 'vat' => 'with',
                    'carrierName' => 'ФармЛогистик', 'carrierContact' => '+7 812 400-55-55', 'carrierRating' => 4.9,
                    'status' => 'unloading', 'createdDaysAgo' => 3, 'loadInDays' => -1, 'transitHours' => 10,
                ],
                [
                    'sourceOrderId' => 'LG-5512', 'fromCity' => 'Казань', 'fromAddress' => 'ул. Восстания, 100',
                    'toCity' => 'Набережные Челны', 'toAddress' => 'пр. Автозаводский, 40',
                    'cargo' => 'Автозапчасти', 'weightKg' => 12800, 'volumeM3' => 55.0, 'places' => 48,
                    'bodyType' => 'фура', 'price' => 26000, 'vat' => 'without',
                    'carrierName' => 'КамТранс', 'carrierContact' => '+7 843 200-66-77', 'carrierRating' => 4.3,
                    'status' => 'in_transit', 'createdDaysAgo' => 2, 'loadInDays' => -1, 'transitHours' => 6,
                    'deviation' => ['kind' => 'plan_fact', 'reason' => 'Отклонение от плана по времени на 1 ч', 'minutes' => 60],
                ],
                [
                    'sourceOrderId' => 'LG-5520', 'fromCity' => 'Москва', 'fromAddress' => 'Каширское ш., 12',
                    'toCity' => 'Тула', 'toAddress' => 'пр. Ленина, 100',
                    'cargo' => 'Полиграфия', 'weightKg' => 6800, 'volumeM3' => 50.0, 'places' => 320,
                    'bodyType' => 'тент', 'price' => 22000, 'vat' => 'with',
                    'carrierName' => 'ПечатьЛайн', 'carrierContact' => '+7 495 700-30-30', 'carrierRating' => 4.6,
                    'status' => 'carrier_assigned', 'createdDaysAgo' => 1, 'loadInDays' => 1, 'transitHours' => 4,
                ],
                [
                    'sourceOrderId' => 'LG-5533', 'fromCity' => 'Воронеж', 'fromAddress' => 'ул. Кольцовская, 24',
                    'toCity' => 'Липецк', 'toAddress' => 'ул. Терешковой, 7',
                    'cargo' => 'Сельхозтехника', 'weightKg' => 19000, 'volumeM3' => 66.0, 'places' => 9,
                    'bodyType' => 'борт', 'price' => 41000, 'vat' => 'without',
                    'carrierName' => 'АгроТрак', 'carrierContact' => '+7 473 200-40-40', 'carrierRating' => 3.9,
                    'status' => 'loading', 'createdDaysAgo' => 1, 'loadInDays' => 0, 'transitHours' => 5,
                ],
                [
                    'sourceOrderId' => 'LG-5544', 'fromCity' => 'Уфа', 'fromAddress' => 'ул. Индустриальное шоссе, 44',
                    'toCity' => 'Самара', 'toAddress' => 'ул. Авроры, 150',
                    'cargo' => 'Химия промышленная', 'weightKg' => 20400, 'volumeM3' => 40.0, 'places' => 20,
                    'bodyType' => 'фура', 'price' => 49000, 'vat' => 'with',
                    'carrierName' => 'ХимТранс', 'carrierContact' => '+7 347 200-50-50', 'carrierRating' => 4.2,
                    'status' => 'delivered', 'createdDaysAgo' => 5, 'loadInDays' => -4, 'transitHours' => 8,
                ],
                [
                    'sourceOrderId' => 'LG-5550', 'fromCity' => 'Пермь', 'fromAddress' => 'ул. Промышленная, 84',
                    'toCity' => 'Екатеринбург', 'toAddress' => 'ул. Малышева, 51',
                    'cargo' => 'Машиностроение: узлы', 'weightKg' => 16800, 'volumeM3' => 52.0, 'places' => 14,
                    'bodyType' => 'тент', 'price' => 37000, 'vat' => 'with',
                    'carrierName' => 'Магистраль', 'carrierContact' => '+7 342 200-70-70', 'carrierRating' => 4.5,
                    'status' => 'cancelled', 'createdDaysAgo' => 4, 'loadInDays' => -3, 'transitHours' => 7,
                ],
                [
                    'sourceOrderId' => 'LG-5561', 'fromCity' => 'Тюмень', 'fromAddress' => 'ул. Мельникайте, 100',
                    'toCity' => 'Омск', 'toAddress' => 'пр. Мира, 55',
                    'cargo' => 'Стройматериалы', 'weightKg' => 21500, 'volumeM3' => 88.0, 'places' => 22,
                    'bodyType' => 'борт', 'price' => 52000, 'vat' => 'without',
                    'carrierName' => 'СеверТранс', 'carrierContact' => '+7 345 200-80-80', 'carrierRating' => 4.1,
                    'status' => 'confirmed', 'createdDaysAgo' => 2, 'loadInDays' => 1, 'transitHours' => 12,
                ],
            ],
            'own' => [
                [
                    'sourceOrderId' => 'СП-9001', 'fromCity' => 'Москва', 'fromAddress' => 'Складочная ул., 1',
                    'toCity' => 'Ярославль', 'toAddress' => 'Московский пр., 108',
                    'cargo' => 'Продукты питания', 'weightKg' => 11200, 'volumeM3' => 58.0, 'places' => 640,
                    'bodyType' => 'реф', 'price' => 31000, 'vat' => 'with',
                    'carrierName' => 'Собственный парк', 'carrierContact' => '+7 495 100-00-01', 'carrierRating' => 5.0,
                    'status' => 'in_transit', 'createdDaysAgo' => 2, 'loadInDays' => -1, 'transitHours' => 5,
                ],
                [
                    'sourceOrderId' => 'СП-9007', 'fromCity' => 'Москва', 'fromAddress' => 'Складочная ул., 1',
                    'toCity' => 'Владимир', 'toAddress' => 'ул. Добросельская, 2',
                    'cargo' => 'Товары народного потребления', 'weightKg' => 8600, 'volumeM3' => 62.0, 'places' => 420,
                    'bodyType' => 'тент', 'price' => 27000, 'vat' => 'with',
                    'carrierName' => 'ГрузАвто', 'carrierContact' => '+7 492 200-11-11', 'carrierRating' => 4.0,
                    'status' => 'carrier_assigned', 'createdDaysAgo' => 1, 'loadInDays' => 2, 'transitHours' => 4,
                ],
                [
                    'sourceOrderId' => 'СП-9014',                     'fromCity' => 'Санкт-Петербург', 'fromAddress' => 'Пулковское ш., 34',
                    'toCity' => 'Псков', 'toAddress' => 'ул. Инженерная, 90',
                    'cargo' => 'Бытовая техника', 'weightKg' => 14200, 'volumeM3' => 74.0, 'places' => 160,
                    'bodyType' => 'фура', 'price' => 44000, 'vat' => 'without',
                    'carrierName' => 'БалтТрак', 'carrierContact' => '+7 812 200-12-12', 'carrierRating' => 4.3,
                    'status' => 'loading', 'createdDaysAgo' => 1, 'loadInDays' => 0, 'transitHours' => 6,
                ],
                [
                    'sourceOrderId' => 'СП-9020', 'fromCity' => 'Москва', 'fromAddress' => 'Складочная ул., 1',
                    'toCity' => 'Смоленск', 'toAddress' => 'ул. Кутузова, 1',
                    'cargo' => 'Электроника', 'weightKg' => 4800, 'volumeM3' => 34.0, 'places' => 210,
                    'bodyType' => 'изотерм', 'price' => 24000, 'vat' => 'with',
                    'carrierName' => 'ЭкспрессПро', 'carrierContact' => '+7 481 200-13-13', 'carrierRating' => 4.7,
                    'status' => 'delivered', 'createdDaysAgo' => 5, 'loadInDays' => -4, 'transitHours' => 7,
                ],
                [
                    'sourceOrderId' => 'СП-9028', 'fromCity' => 'Москва', 'fromAddress' => 'Складочная ул., 1',
                    'toCity' => 'Калуга', 'toAddress' => 'Грабцевское ш., 122',
                    'cargo' => 'Автозапчасти', 'weightKg' => 10200, 'volumeM3' => 46.0, 'places' => 58,
                    'bodyType' => 'тент', 'price' => 29000, 'vat' => 'with',
                    'carrierName' => 'ГрузАвто', 'carrierContact' => '+7 484 200-14-14', 'carrierRating' => 4.0,
                    'status' => 'confirmed', 'createdDaysAgo' => 2, 'loadInDays' => 1, 'transitHours' => 5,
                ],
                [
                    'sourceOrderId' => 'СП-9033', 'fromCity' => 'Нижний Новгород', 'fromAddress' => 'ул. Ларина, 20',
                    'toCity' => 'Чебоксары', 'toAddress' => 'пр. Мира, 62',
                    'cargo' => 'Мебель', 'weightKg' => 9200, 'volumeM3' => 80.0, 'places' => 260,
                    'bodyType' => 'фура', 'price' => 23000, 'vat' => 'without',
                    'carrierName' => 'ВолгаТранс', 'carrierContact' => '+7 831 200-15-15', 'carrierRating' => 4.2,
                    'status' => 'created', 'createdDaysAgo' => 0, 'loadInDays' => 2, 'transitHours' => 6,
                ],
            ],
        ];
    }
}
