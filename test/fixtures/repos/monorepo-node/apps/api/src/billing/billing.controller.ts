import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('invoices')
export class BillingController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { data: { id } };
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return { data: dto };
  }
}
