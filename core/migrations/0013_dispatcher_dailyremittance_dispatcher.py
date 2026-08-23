from django.db import migrations, models
import django.db.models.deletion


def clear_legacy_remittances(apps, schema_editor):
    DispatchRound = apps.get_model('core', 'DispatchRound')
    DailyRemittance = apps.get_model('core', 'DailyRemittance')
    DispatchRound.objects.all().delete()
    DailyRemittance.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_remittancecorrection'),
    ]

    operations = [
        migrations.CreateModel(
            name='Dispatcher',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('full_name', models.CharField(max_length=255)),
                ('contact_number', models.CharField(blank=True, max_length=30, null=True)),
            ],
        ),
        migrations.AddField(
            model_name='dailyremittance',
            name='dispatcher',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.dispatcher',
            ),
        ),
        migrations.RunPython(clear_legacy_remittances, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='dailyremittance',
            name='dispatcher_name',
        ),
        migrations.AlterField(
            model_name='dailyremittance',
            name='dispatcher',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='daily_remittances',
                to='core.dispatcher',
            ),
        ),
    ]
